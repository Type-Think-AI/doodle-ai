import type { APIContext } from "astro";
import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../../db/client";
import { board, boardMember } from "../../../../../db/schema/boards";
import { apiError, apiJson, requireOrg, type OrgContext } from "../../../../../lib/auth/guards";
import { optStr, readJson } from "../../../../../lib/api/body";
import { toBoardDetail } from "../../../../../lib/boards/queries";
import { resolveBoardRole, hasTier, REQUIRED_TIER, type BoardTier } from "../../../../../lib/boards/access";
import { BOARD_VIEW_MODES, type BoardViewMode } from "../../../../../db/schema/boards";

export const prerender = false;

const NAME_MAX_LEN = 120;
const DESC_MAX_LEN = 2000;

function notFound(): Response {
  return apiError("not_found", "That board doesn't exist.", 404);
}

/** Shared: load board + resolve caller's tier, or return an error response. */
async function loadBoard(context: APIContext): Promise<
  | { error: Response }
  | { org: OrgContext; db: ReturnType<typeof getDb>; row: typeof board.$inferSelect; tier: BoardTier }
> {
  const org = await requireOrg(context);
  if (org instanceof Response) return { error: org };
  const id = context.params.id;
  if (!id) return { error: notFound() };

  const db = getDb(context);
  const rows = await db.select().from(board).where(eq(board.id, id)).limit(1);
  const row = rows[0];
  if (!row) return { error: notFound() };

  // Ownership check: must be in the same org OR caller is a member.
  if (row.organizationId !== org.orgId) {
    // Check if caller is a board member (cross-org share).
    const crossOrgMemberRows = await db
      .select()
      .from(boardMember)
      .where(and(eq(boardMember.boardId, id), eq(boardMember.userId, org.user.id)))
      .limit(1);
    if (crossOrgMemberRows.length === 0) return { error: notFound() };
  }

  // Resolve membership row if any.
  const memberRows = await db
    .select()
    .from(boardMember)
    .where(and(eq(boardMember.boardId, id), eq(boardMember.userId, org.user.id)))
    .limit(1);
  const memberRole = (memberRows[0]?.role as "view" | "comment" | "edit") ?? null;

  const tier = resolveBoardRole(row.createdBy, org.user.id, memberRole, null);
  if (!tier) return { error: notFound() };

  return { org, db, row, tier };
}

export async function GET(context: APIContext): Promise<Response> {
  const result = await loadBoard(context);
  if ("error" in result) return result.error;
  return apiJson({ board: toBoardDetail(result.row) });
}

/**
 * PATCH /api/v1/boards/:id — `{ name?, description?, viewMode?, archivedAt? }`.
 *
 * Only the owner can rename or archive. Editors cannot mutate the board itself.
 */
export async function PATCH(context: APIContext): Promise<Response> {
  const result = await loadBoard(context);
  if ("error" in result) return result.error;
  const { db, row, tier } = result;

  if (!hasTier(tier, REQUIRED_TIER.mutateBoard)) {
    return apiError("forbidden", "You don't have permission to edit this board.", 403);
  }

  // Inbox: cannot rename or change kind.
  const body = await readJson(context.request);
  if (!body) return apiError("bad_request", "Expected a JSON body.", 400);

  const patch: Partial<typeof board.$inferInsert> = { updatedAt: new Date() };

  if ("name" in body) {
    if (row.kind === "inbox") return apiError("bad_request", "The Inbox board cannot be renamed.", 400);
    const name = optStr(body.name);
    if (!name) return apiError("bad_request", "`name` can't be empty.", 400);
    patch.name = name.slice(0, NAME_MAX_LEN);
  }

  if ("description" in body) {
    patch.description = optStr(body.description)?.slice(0, DESC_MAX_LEN) ?? null;
  }

  if ("viewMode" in body) {
    if (!BOARD_VIEW_MODES.includes(body.viewMode as BoardViewMode)) {
      return apiError("bad_request", "`viewMode` must be 'grid' or 'canvas'.", 400);
    }
    patch.viewMode = body.viewMode as string;
  }

  if ("archivedAt" in body) {
    if (row.kind === "inbox") return apiError("bad_request", "The Inbox board cannot be archived.", 400);
    patch.archivedAt = body.archivedAt ? new Date() : null;
  }

  const updated = await db.update(board).set(patch).where(eq(board.id, row.id)).returning();
  const updatedRow = updated[0];
  if (!updatedRow) return notFound();
  return apiJson({ board: toBoardDetail(updatedRow) });
}

/**
 * DELETE /api/v1/boards/:id — hard delete.
 *
 * Refuses on kind='inbox'. Items cascade via the FK.
 */
export async function DELETE(context: APIContext): Promise<Response> {
  const result = await loadBoard(context);
  if ("error" in result) return result.error;
  const { db, row, tier } = result;

  if (!hasTier(tier, REQUIRED_TIER.deleteBoard)) {
    return apiError("forbidden", "Only the board owner can delete it.", 403);
  }

  if (row.kind === "inbox") {
    return apiError("bad_request", "The Inbox board cannot be deleted.", 400);
  }

  await db.delete(board).where(eq(board.id, row.id));
  return apiJson({ ok: true });
}
