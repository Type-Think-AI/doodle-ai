/**
 * Per-board tldraw sync server: one Durable Object instance per board.
 *
 * The same reasoning as RoadmapRoom applies — tldraw sync requires exactly ONE
 * TLSocketRoom per room globally, and Cloudflare's single-instance-per-id
 * guarantee for Durable Objects is what enforces that. The DO's id is derived
 * from `idFromName(boardId)`, so each board gets its own SQLite-backed room.
 *
 * Storage is the DO's own SQLite (`new_sqlite_classes` in wrangler.json).
 * This is NOT the project's D1 database — the document is tldraw's internal
 * CRDT-ish record store, persisted by `SQLiteSyncStorage`.
 */
import {
  DurableObjectSqliteSyncWrapper,
  SQLiteSyncStorage,
  type SessionStateSnapshot,
  TLSocketRoom,
} from "@tldraw/sync-core";
import type { TLRecord } from "@tldraw/tlschema";
import { DurableObject } from "cloudflare:workers";
import type { BoardSessionMeta } from "./access";
import { boardAuthorizers } from "./authorize";
import { BOARD_OBJECT_TYPES, boardSchema } from "./schema";

/**
 * What we stash on each WebSocket so a session survives hibernation.
 * `meta` must be preserved: a resumed session must retain the SAME identity
 * it connected with, or the ownership authorizer silently breaks.
 */
interface SocketAttachment {
  sessionId: string;
  meta: BoardSessionMeta;
  snapshot?: SessionStateSnapshot;
}

/** Fallback if an attachment was written before `meta` was stored. */
const ANON_META: BoardSessionMeta = { userId: null, isOwner: false };

export class BoardRoom extends DurableObject<Env> {
  private room: TLSocketRoom<TLRecord, BoardSessionMeta> | null = null;
  private readonly sessionSockets = new Map<string, WebSocket>();

  private getRoom(): TLSocketRoom<TLRecord, BoardSessionMeta> {
    if (this.room) return this.room;

    const sql = new DurableObjectSqliteSyncWrapper(this.ctx.storage);
    const storage = new SQLiteSyncStorage<TLRecord>({ sql });

    this.room = new TLSocketRoom<TLRecord, BoardSessionMeta>({
      schema: boardSchema,
      storage,
      objectTypes: BOARD_OBJECT_TYPES,
      authorizeRecord: boardAuthorizers,
      clientTimeout: Infinity,
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

    // Re-adopt sockets that outlived a hibernation cycle.
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
   * `fetch` rather than RPC: a WebSocket cannot cross the RPC boundary
   * (DataCloneError). Permissions arrive as headers on an internally-constructed
   * request — safe because the connect route builds a BRAND NEW Request and
   * none of the browser's headers reach here.
   */
  override async fetch(request: Request): Promise<Response> {
    const sessionId = request.headers.get("x-board-session");
    if (!sessionId) return new Response("Missing session", { status: 400 });

    const isReadonly = request.headers.get("x-board-readonly") !== "false";
    const objectAccess = request.headers.get("x-board-object-access") === "write" ? "write" : "read";

    const userIdHeader = request.headers.get("x-board-user");
    const meta: BoardSessionMeta = {
      userId: userIdHeader && userIdHeader.length > 0 ? userIdHeader : null,
      isOwner: request.headers.get("x-board-owner") === "true",
    };

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

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

  /* ---- Hibernation event handlers ---- */

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
     These bypass authorizeRecord entirely. The server IS the admin; writes
     happen on behalf of authenticated operations whose D1 row is the real
     record. The canvas shape is a projection. */

  /**
   * Place an image shape onto the board's canvas.
   *
   * Called by drop-item.ts after a generation completes. The shape is created
   * with no `authorId` in meta, making it owner-only for edits/deletes —
   * matching the intent that server-placed items are board furniture managed
   * by the owner.
   *
   * @param url     - PicX CDN URL of the generated image
   * @param width   - intrinsic width in pixels
   * @param height  - intrinsic height in pixels
   * @param assetId - a stable id for the tldraw asset record (dedupe key)
   */
  async dropImage(url: string, width: number, height: number, assetId: string): Promise<void> {
    const room = this.getRoom();

    // Position: stagger based on time to avoid stacking.
    const offset = Date.now() % 2000;
    const x = 100 + offset;
    const y = 100 + Math.floor(Math.random() * 200);

    const shapeId = `shape:board-img-${Date.now().toString(36)}` as `shape:${string}`;
    const tldrawAssetId = `asset:${assetId}` as `asset:${string}`;

    await room.updateStore((store) => {
      // Create the asset record (image metadata pointing at the CDN URL).
      store.put({
        id: tldrawAssetId,
        typeName: "asset",
        type: "image",
        props: {
          name: "generation",
          src: url,
          w: width,
          h: height,
          mimeType: "image/png",
          isAnimated: false,
          fileSize: -1, // Unknown for CDN URLs; tldraw tolerates -1.
        },
        meta: {},
      } as any);

      // Create the image shape referencing the asset.
      store.put({
        id: shapeId,
        typeName: "shape",
        type: "image",
        x,
        y,
        rotation: 0,
        index: "aZ" as any,
        parentId: "page:page" as any,
        isLocked: false,
        opacity: 1,
        props: {
          assetId: tldrawAssetId,
          w: Math.min(width, 600), // cap display size
          h: Math.min(height, 600) * (height / width),
          playing: true,
          url: "",
          crop: null,
          flipX: false,
          flipY: false,
        },
        meta: {},
      } as any);
    });
  }
}
