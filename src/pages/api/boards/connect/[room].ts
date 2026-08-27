/**
 * WebSocket entry point for board canvases: GET /api/boards/connect/:room
 *
 * THIS IS THE ENTIRE SECURITY BOUNDARY FOR BOARD MULTIPLAYER.
 *
 * Unlike the roadmap (which validates against a hardcoded room allowlist),
 * boards validate against D1: the room id IS the board id, and the connection
 * is permitted only if:
 *
 *   (a) a `board` row with that id exists and is NOT archived, AND
 *   (b) the caller satisfies ONE of:
 *       - is the board's `createdBy` (owner), OR
 *       - has a `board_member` row for that board, OR
 *       - presents a valid (non-revoked, non-expired) `share_link` with
 *         scope='board' and that boardId.
 *
 * Unauthenticated callers with no valid share link get 404 — NOT 403 — to
 * avoid leaking board existence to probers.
 *
 * The route resolves permissions and hands the socket to the BoardRoom DO.
 * The DO never re-derives permissions. This is a deliberate security property:
 * the DO trusts what it receives because the route builds a BRAND NEW Request
 * (never forwards the caller's), so the x-board-* headers cannot be spoofed.
 */
import type { APIContext } from "astro";
import { and, eq, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../../../../db/schema";
import { optionalAuth } from "../../../../lib/auth/guards";
import { BOARD_PERMISSIONS, resolveBoardTier } from "../../../../boards/access";

export const prerender = false;

export async function GET(context: APIContext): Promise<Response> {
  const env = (context.locals as { runtime?: { env?: Env } })?.runtime?.env;
  if (!env?.BOARD_ROOM) {
    return new Response(
      "Board sync requires the Workers runtime — run `pnpm dev` (wrangler), not `pnpm dev:local`.",
      { status: 503 },
    );
  }

  const boardId = context.params.room ?? "";
  if (!boardId || boardId.length > 64) return new Response("Not found", { status: 404 });

  if (context.request.headers.get("upgrade") !== "websocket") {
    return new Response("Expected a WebSocket upgrade", { status: 426 });
  }

  const db = drizzle(env.DB, { schema });

  /* ──────────────────────────────────────────────────────────────────────────
   * Step 1: Does the board exist and is it not archived?
   *
   * This is the first gate. A Durable Object id is derived from a name, so
   * accepting arbitrary names would let anyone mint unlimited rooms and
   * unlimited SQLite storage — the exact attack the roadmap's allowlist
   * prevents. For boards, the D1 lookup IS that allowlist.
   * ────────────────────────────────────────────────────────────────────────── */
  const boardRow = await db
    .select({
      id: schema.board.id,
      createdBy: schema.board.createdBy,
      archivedAt: schema.board.archivedAt,
    })
    .from(schema.board)
    .where(eq(schema.board.id, boardId))
    .get();

  if (!boardRow || boardRow.archivedAt !== null) {
    return new Response("Not found", { status: 404 });
  }

  /* ──────────────────────────────────────────────────────────────────────────
   * Step 2: Who is calling and what is their relationship to this board?
   * ────────────────────────────────────────────────────────────────────────── */
  const user = await optionalAuth(context);

  let isOwner = false;
  let memberRole: string | null = null;
  let shareLinkRole: string | null = null;

  if (user) {
    // Check ownership
    isOwner = boardRow.createdBy === user.id;

    // Check explicit membership (if not already the owner)
    if (!isOwner) {
      const memberRow = await db
        .select({ role: schema.boardMember.role })
        .from(schema.boardMember)
        .where(and(eq(schema.boardMember.boardId, boardId), eq(schema.boardMember.userId, user.id)))
        .get();
      memberRole = memberRow?.role ?? null;
    }
  }

  // Check share link (from ?token= query param). Works for both authenticated
  // and unauthenticated callers — this is how "anyone with the link" access works.
  const url = new URL(context.request.url);
  const linkToken = url.searchParams.get("token");

  if (linkToken) {
    const now = new Date();
    const linkRow = await db
      .select({
        boardId: schema.shareLink.boardId,
        scope: schema.shareLink.scope,
        allowComments: schema.shareLink.allowComments,
        expiresAt: schema.shareLink.expiresAt,
        revokedAt: schema.shareLink.revokedAt,
      })
      .from(schema.shareLink)
      .where(
        and(
          eq(schema.shareLink.token, linkToken),
          eq(schema.shareLink.scope, "board"),
          eq(schema.shareLink.boardId, boardId),
          isNull(schema.shareLink.revokedAt),
        ),
      )
      .get();

    if (linkRow) {
      // Check expiry
      const notExpired = !linkRow.expiresAt || linkRow.expiresAt > now;
      if (notExpired) {
        // share_link with allowComments=true gets 'comment' tier;
        // allowComments=false gets 'view' tier.
        // (A share link never grants 'edit' — that requires explicit membership.)
        shareLinkRole = linkRow.allowComments ? "comment" : "view";
      }
    }
  }

  /* ──────────────────────────────────────────────────────────────────────────
   * Step 3: Does the caller have ANY valid access path?
   *
   * If they are not the owner, not a member, and don't hold a valid share link,
   * return 404 to avoid leaking that the board exists.
   * ────────────────────────────────────────────────────────────────────────── */
  if (!isOwner && !memberRole && !shareLinkRole) {
    return new Response("Not found", { status: 404 });
  }

  /* ──────────────────────────────────────────────────────────────────────────
   * Step 4: Resolve the final permission tier and hand off to the DO.
   * ────────────────────────────────────────────────────────────────────────── */
  const tier = resolveBoardTier(isOwner, memberRole, shareLinkRole);
  const { isReadonly, objectAccess } = BOARD_PERMISSIONS[tier];

  // Session id: per-tab, not per-user, so two tabs don't fight over one sync
  // session. Prefix with user id for presence attribution.
  const sessionId = `${user?.id ?? "anon"}:${crypto.randomUUID()}`;

  const stub = env.BOARD_ROOM.get(env.BOARD_ROOM.idFromName(boardId));

  /* A brand-new Request, NOT a forward of the caller's.
   *
   * Two load-bearing reasons (same as roadmap):
   *  - WebSocket cannot cross DO RPC (DataCloneError).
   *  - None of the client's headers are copied, so x-board-* headers cannot
   *    be spoofed from a browser. This IS the security guarantee.
   */
  return stub.fetch(
    new Request("https://board.internal/connect", {
      headers: {
        upgrade: "websocket",
        "x-board-session": sessionId,
        "x-board-readonly": String(isReadonly),
        "x-board-object-access": objectAccess,
        "x-board-user": user?.id ?? "",
        "x-board-owner": String(isOwner),
      },
    }),
  );
}
