/**
 * The roadmap board's sync server: one Durable Object instance per room.
 *
 * A Durable Object is the right primitive here for a specific reason — tldraw
 * sync requires that there is only ever ONE `TLSocketRoom` in existence for a
 * given room, globally. Two rooms for one board means two authoritative copies
 * of the document, and users silently overwriting each other. Cloudflare
 * guarantees single-instance-per-id for Durable Objects, which is exactly that
 * constraint enforced by the platform instead of by hope.
 *
 * Storage is the DO's own SQLite, via tldraw's `SQLiteSyncStorage`. Note this
 * is NOT the project's D1 database: the document is a CRDT-ish record store
 * that tldraw owns the shape of, and it persists itself. D1 stays the store for
 * the things the app reasons about (users, credits, feedback), which is the
 * right split — see the comment on mirroring at the bottom of this file.
 *
 * SQLite-backed Durable Objects are available on the Workers FREE plan
 * (key-value-backed ones are not), which is why `wrangler.json` declares this
 * class under `new_sqlite_classes`.
 */
import {
  DurableObjectSqliteSyncWrapper,
  SQLiteSyncStorage,
  type SessionStateSnapshot,
  TLSocketRoom,
} from "@tldraw/sync-core";
import type { TLNoteShape, TLPageId, TLRecord, TLShapeId } from "@tldraw/tlschema";
import { toRichText } from "@tldraw/tlschema";
import { DurableObject } from "cloudflare:workers";
import type { RoadmapSessionMeta } from "./access";
import { roadmapAuthorizers } from "./authorize";
import { ROADMAP_OBJECT_TYPES, roadmapSchema } from "./schema";

/**
 * What we stash on each WebSocket so a session can survive hibernation.
 * Cloudflare keeps sockets open while the object sleeps, but in-memory state
 * (including the TLSocketRoom) is gone on wake — without this, every wake would
 * force every connected client to reconnect from scratch.
 *
 * `meta` is part of the attachment because a resumed session must be restored
 * with the SAME identity it connected with. Losing it on wake would leave the
 * ownership authorizer with no user id, silently downgrading a contributor to
 * "cannot write anything" until they reloaded the page.
 */
interface SocketAttachment {
  sessionId: string;
  meta: RoadmapSessionMeta;
  snapshot?: SessionStateSnapshot;
}

/** Anonymous fallback for an attachment written before `meta` was stored. */
const ANON_META: RoadmapSessionMeta = { userId: null, isAdmin: false };

export class RoadmapRoom extends DurableObject<Env> {
  private room: TLSocketRoom<TLRecord, RoadmapSessionMeta> | null = null;
  /** sessionId -> socket, needed so onSessionSnapshot can find the right socket. */
  private readonly sessionSockets = new Map<string, WebSocket>();

  private getRoom(): TLSocketRoom<TLRecord, RoadmapSessionMeta> {
    if (this.room) return this.room;

    const sql = new DurableObjectSqliteSyncWrapper(this.ctx.storage);
    const storage = new SQLiteSyncStorage<TLRecord>({ sql });

    this.room = new TLSocketRoom<TLRecord, RoadmapSessionMeta>({
      schema: roadmapSchema,
      storage,
      // Comment threads/reactions are served through the object-store lane so
      // they can be permissioned separately from the document. This is what
      // makes the "contribute" tier possible — see src/roadmap/access.ts.
      objectTypes: ROADMAP_OBJECT_TYPES,
      /* Per-record ownership: contributors may add anything and change only
         what they added; maintainers may change anything. This is the guard
         that replaced blanket read-only for signed-in users, so it is the
         board's real access control — see src/roadmap/authorize.ts. */
      authorizeRecord: roadmapAuthorizers,
      // Cloudflare keeps WebSockets alive across hibernation and handles
      // keep-alive itself. The room's own idle timer would otherwise decide
      // that perfectly healthy hibernating clients had gone away.
      clientTimeout: Infinity,
      // Persist each session's state onto its socket when it goes idle (~5s of
      // no messages), so handleSocketResume below can restore it after a wake.
      onSessionSnapshot: (sessionId, snapshot) => {
        const ws = this.sessionSockets.get(sessionId);
        if (!ws) return;
        const existing = ws.deserializeAttachment() as SocketAttachment | null;
        ws.serializeAttachment({
          sessionId,
          meta: existing?.meta ?? ANON_META,
          snapshot,
        } satisfies SocketAttachment);
      },
    });

    // Re-adopt any sockets that outlived a hibernation cycle. Restores them
    // straight into Connected state, so the client never notices the object
    // was asleep.
    for (const ws of this.ctx.getWebSockets()) {
      const attachment = ws.deserializeAttachment() as SocketAttachment | null;
      if (attachment?.sessionId) {
        this.sessionSockets.set(attachment.sessionId, ws);
        if (attachment.snapshot) {
          this.room.handleSocketResume({
            sessionId: attachment.sessionId,
            socket: ws,
            snapshot: attachment.snapshot,
            meta: attachment.meta ?? ANON_META,
          });
        }
      }
    }

    return this.room;
  }

  /**
   * Accept a WebSocket for one participant.
   *
   * This is a `fetch` handler rather than an RPC method for a hard runtime
   * reason: a WebSocket cannot cross the RPC boundary. Returning one from an
   * RPC method fails with `DataCloneError: Could not serialize object of type
   * "WebSocket"`. Handing back a 101 response from `fetch` is the only way to
   * pass a socket out of a Durable Object.
   *
   * Permissions arrive as headers on an internally-constructed request. That is
   * safe specifically because the connect route builds a BRAND NEW Request
   * rather than forwarding the caller's — a browser cannot inject these headers,
   * because none of its headers reach this method. The route remains the only
   * place authorization is decided; see src/roadmap/access.ts.
   */
  override async fetch(request: Request): Promise<Response> {
    const sessionId = request.headers.get("x-roadmap-session");
    if (!sessionId) return new Response("Missing session", { status: 400 });

    const isReadonly = request.headers.get("x-roadmap-readonly") !== "false";
    const objectAccess = request.headers.get("x-roadmap-object-access") === "write" ? "write" : "read";

    /* Identity for the ownership authorizer. Trusted for exactly the same
       reason the permission headers above are: the connect route builds a brand
       new Request, so none of the browser's headers reach this method and a
       client cannot claim to be an admin. */
    const userIdHeader = request.headers.get("x-roadmap-user");
    const meta: RoadmapSessionMeta = {
      userId: userIdHeader && userIdHeader.length > 0 ? userIdHeader : null,
      isAdmin: request.headers.get("x-roadmap-admin") === "true",
    };

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    // Hibernatable accept: duration charges stop once handlers finish running,
    // rather than billing for the whole time the socket is open.
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ sessionId, meta } satisfies SocketAttachment);
    this.sessionSockets.set(sessionId, server);

    this.getRoom().handleSocketConnect({
      sessionId,
      socket: server,
      isReadonly,
      objectAccess,
      meta,
    });

    return new Response(null, { status: 101, webSocket: client });
  }

  /* ---- Hibernation event handlers ----
     Required by the hibernation API: while the object is asleep Cloudflare
     delivers socket events here rather than to a live in-memory handler, and
     getRoom() rehydrates the room on the first one. */

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const attachment = ws.deserializeAttachment() as SocketAttachment | null;
    if (!attachment?.sessionId) return;
    this.sessionSockets.set(attachment.sessionId, ws);
    this.getRoom().handleSocketMessage(attachment.sessionId, message);
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    const attachment = ws.deserializeAttachment() as SocketAttachment | null;
    if (!attachment?.sessionId) return;
    this.sessionSockets.delete(attachment.sessionId);
    this.getRoom().handleSocketClose(attachment.sessionId);
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    const attachment = ws.deserializeAttachment() as SocketAttachment | null;
    if (!attachment?.sessionId) return;
    this.sessionSockets.delete(attachment.sessionId);
    this.getRoom().handleSocketError(attachment.sessionId);
  }

  /* ---- RPC: server-initiated writes ----
     These bypass authorizeRecord entirely. That is correct and deliberate: the
     server IS the admin, and the writes happen on behalf of authenticated users
     whose D1 row is the real record. The board shape is a projection. */

  /**
   * Drop a feedback sticky onto the ICE BOX column.
   *
   * Called by POST /api/v1/feedback after the D1 insert. The note is created
   * with no `authorId` in `meta`, which makes it admin-only for edits/deletes
   * — matching the intent that user feedback notes are visible but only triaged
   * by maintainers.
   *
   * Position: bottom of the leftmost (ICE BOX) column, stacked below existing
   * feedback notes. We use a deterministic x and a monotonically increasing y
   * based on the current clock so notes don't overlap.
   */
  async addFeedbackNote(text: string, authorName: string): Promise<void> {
    const room = this.getRoom();
    const id = `shape:feedback-${Date.now().toString(36)}` as TLShapeId;
    const y = 800 + Math.floor(Math.random() * 40);
    const pageId = "page:page" as TLPageId;

    await room.updateStore((store) => {
      const note = {
        id,
        typeName: "shape",
        type: "note",
        x: 0,
        y,
        rotation: 0,
        index: "aZ" as TLNoteShape["index"],
        parentId: pageId,
        isLocked: false,
        opacity: 1,
        props: {
          richText: toRichText(`${text}\n— ${authorName}`),
          color: "orange",
          size: "m",
          font: "sans",
          align: "middle",
          verticalAlign: "middle",
          growY: 0,
          fontSizeAdjustment: 1,
          url: "",
          scale: 1,
          labelColor: "black",
          textLastEditedBy: null,
        },
        meta: { feedbackNote: true },
      } satisfies TLNoteShape;
      store.put(note);
    });
  }
}

/* Deliberately NOT mirroring the document into D1 yet.
 *
 * `TLSocketRoom` exposes an `onCommittedChanges` callback for exactly that, and
 * it is how the existing /admin/feedback triage view would eventually read
 * roadmap comments. It is left out of this first cut on purpose: a mirror that
 * is written but never read is just a second source of truth to keep in sync,
 * and the board has to prove itself before the admin surface is rebuilt around
 * it. The hook is named here so the next person knows where it goes rather than
 * inventing a polling job. */
