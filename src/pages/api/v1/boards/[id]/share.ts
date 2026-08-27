import type { APIContext } from "astro";
import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "../../../../../db/client";
import { board, boardMember } from "../../../../../db/schema/boards";
import { shareLink } from "../../../../../db/schema/product";
import { apiError, apiJson, requireOrg } from "../../../../../lib/auth/guards";
import { newId, readJson } from "../../../../../lib/api/body";
import { expiryFromDays, newShareToken } from "../../../../../lib/api/share";
import { resolveBoardRole, hasTier, REQUIRED_TIER } from "../../../../../lib/boards/access";
import type { BoardRole } from "../../../../../db/schema/boards";

export const prerender = false;

/**
 * POST /api/v1/boards/:id/share — mint a share link for this board.
 *
 * `{ role?: 'view'|'comment', expiresInDays?: number }`
 *
 * Every call mints a *new* token, matching the project share route's pattern.
 */
export async function POST(context: APIContext): Promise<Response> {
  const org = await requireOrg(context);
  if (org instanceof Response) return org;
  const boardId = context.params.id;
  if (!boardId) return apiError("not_found", "That board doesn't exist.", 404);

  const db = getDb(context);
  const boardRows = await db.select().from(board).where(eq(board.id, boardId)).limit(1);
  const boardRow = boardRows[0];
  if (!boardRow) return apiError("not_found", "That board doesn't exist.", 404);

  // Access: only the owner can create share links.
  const memberRows = await db
    .select()
    .from(boardMember)
    .where(and(eq(boardMember.boardId, boardId), eq(boardMember.userId, org.user.id)))
    .limit(1);
  const memberRole = (memberRows[0]?.role as BoardRole) ?? null;

  if (boardRow.organizationId !== org.orgId && !memberRole) {
    return apiError("not_found", "That board doesn't exist.", 404);
  }

  const tier = resolveBoardRole(boardRow.createdBy, org.user.id, memberRole, null);
  if (!hasTier(tier, REQUIRED_TIER.manageSharing)) {
    return apiError("forbidden", "Only the board owner can create share links.", 403);
  }

  const body = await readJson(context.request);
  const role = (body?.role as string) ?? "view";
  if (!["view", "comment"].includes(role)) {
    // Share links can only grant view or comment. The `edit` tier requires an
    // explicit boardMember row because share_link has no `role` column — only
    // `allowComments` (boolean). Returning role:'edit' in the response would be
    // a lie: resolveBoardRole maps share links to 'comment'|'view' only.
    if (role === "edit") {
      return apiError(
        "bad_request",
        "Share links can grant View or Comment only. To give someone edit access, invite them as a board member.",
        400,
      );
    }
    return apiError("bad_request", "`role` must be 'view' or 'comment'.", 400);
  }

  const allowComments = role === "comment";
  const origin = new URL(context.request.url).origin;

  const values = {
    id: newId(),
    token: newShareToken(),
    organizationId: boardRow.organizationId,
    projectId: null,
    assetId: null,
    boardId,
    scope: "board",
    allowComments,
    expiresAt: expiryFromDays(body?.expiresInDays),
    revokedAt: null,
    createdBy: org.user.id,
    createdAt: new Date(),
  } satisfies typeof shareLink.$inferInsert;

  await db.insert(shareLink).values(values);

  return apiJson(
    {
      link: {
        id: values.id,
        url: `${origin}/s/${values.token}`,
        role,
        allowComments,
        expiresAt: values.expiresAt?.getTime() ?? null,
        createdAt: values.createdAt.getTime(),
      },
    },
    201,
  );
}

/**
 * DELETE /api/v1/boards/:id/share?linkId=...  — revoke a share link.
 *
 * Revoking stops the link from resolving. It does NOT un-publish the
 * underlying PicX CDN URLs, which are permanent and unguessable but public
 * by construction — carry this wording forward from
 * src/pages/api/v1/projects/[id]/share.ts.
 */
export async function DELETE(context: APIContext): Promise<Response> {
  const org = await requireOrg(context);
  if (org instanceof Response) return org;
  const boardId = context.params.id;
  if (!boardId) return apiError("not_found", "That board doesn't exist.", 404);

  const db = getDb(context);
  const boardRows = await db.select().from(board).where(eq(board.id, boardId)).limit(1);
  const boardRow = boardRows[0];
  if (!boardRow) return apiError("not_found", "That board doesn't exist.", 404);

  // Owner check.
  const memberRows = await db
    .select()
    .from(boardMember)
    .where(and(eq(boardMember.boardId, boardId), eq(boardMember.userId, org.user.id)))
    .limit(1);
  const memberRole = (memberRows[0]?.role as BoardRole) ?? null;

  if (boardRow.organizationId !== org.orgId && !memberRole) {
    return apiError("not_found", "That board doesn't exist.", 404);
  }

  const tier = resolveBoardRole(boardRow.createdBy, org.user.id, memberRole, null);
  if (!hasTier(tier, REQUIRED_TIER.manageSharing)) {
    return apiError("forbidden", "Only the board owner can revoke share links.", 403);
  }

  const url = new URL(context.request.url);
  const linkId = url.searchParams.get("linkId");
  if (!linkId) return apiError("bad_request", "`linkId` query param is required.", 400);

  const revoked = await db
    .update(shareLink)
    .set({ revokedAt: new Date() })
    .where(and(eq(shareLink.id, linkId), eq(shareLink.boardId, boardId), isNull(shareLink.revokedAt)))
    .returning({ id: shareLink.id });

  if (revoked.length === 0) {
    return apiError("not_found", "That share link doesn't exist or was already revoked.", 404);
  }

  return apiJson({ ok: true, note: "The link no longer resolves. This does NOT un-publish CDN image URLs, which remain publicly accessible." });
}

/**
 * GET /api/v1/boards/:id/share — list active (non-revoked, non-expired) share links.
 *
 * Owner only — the same guard as POST and DELETE.
 */
export async function GET(context: APIContext): Promise<Response> {
  const org = await requireOrg(context);
  if (org instanceof Response) return org;
  const boardId = context.params.id;
  if (!boardId) return apiError("not_found", "That board doesn't exist.", 404);

  const db = getDb(context);
  const boardRows = await db.select().from(board).where(eq(board.id, boardId)).limit(1);
  const boardRow = boardRows[0];
  if (!boardRow) return apiError("not_found", "That board doesn't exist.", 404);

  // Access: only the owner can list share links.
  const memberRows = await db
    .select()
    .from(boardMember)
    .where(and(eq(boardMember.boardId, boardId), eq(boardMember.userId, org.user.id)))
    .limit(1);
  const memberRole = (memberRows[0]?.role as BoardRole) ?? null;

  if (boardRow.organizationId !== org.orgId && !memberRole) {
    return apiError("not_found", "That board doesn't exist.", 404);
  }

  const tier = resolveBoardRole(boardRow.createdBy, org.user.id, memberRole, null);
  if (!hasTier(tier, REQUIRED_TIER.manageSharing)) {
    return apiError("forbidden", "Only the board owner can view share links.", 403);
  }

  const origin = new URL(context.request.url).origin;
  const now = Date.now();

  const rows = await db
    .select()
    .from(shareLink)
    .where(and(eq(shareLink.boardId, boardId), eq(shareLink.scope, "board"), isNull(shareLink.revokedAt)));

  // Filter out expired links in application code (D1 has no timestamp comparison operator).
  const active = rows.filter((r) => !r.expiresAt || r.expiresAt.getTime() > now);

  const links = active.map((r) => ({
    id: r.id,
    url: `${origin}/s/${r.token}`,
    role: r.allowComments ? "comment" : "view",
    allowComments: r.allowComments,
    expiresAt: r.expiresAt?.getTime() ?? null,
    createdAt: r.createdAt.getTime(),
  }));

  return apiJson({ links });
}
