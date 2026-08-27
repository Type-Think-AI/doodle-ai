import type { APIContext } from "astro";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "../../../../../../db/client";
import { board, boardItem, boardMember } from "../../../../../../db/schema/boards";
import { apiError, apiJson, requireOrg } from "../../../../../../lib/auth/guards";
import { optStr, readJson, str } from "../../../../../../lib/api/body";
import { toBoardItemDto } from "../../../../../../lib/boards/queries";
import { resolveBoardRole, hasTier, REQUIRED_TIER } from "../../../../../../lib/boards/access";
import { midKey, appendKey } from "../../../../../../lib/boards/sort-key";

export const prerender = false;

/**
 * PATCH /api/v1/boards/:id/items/:itemId
 *
 * Supports:
 *   - { note }           — update the note
 *   - { boardId }        — MOVE item to another board (caller must have edit on both)
 *   - { beforeId, afterId } — REORDER via computed sortKey (exactly ONE must be present
 *     unless positioning at start/end, in which case only one is needed)
 */
export async function PATCH(context: APIContext): Promise<Response> {
  const org = await requireOrg(context);
  if (org instanceof Response) return org;
  const boardId = context.params.id;
  const itemId = context.params.itemId;
  if (!boardId || !itemId) return apiError("not_found", "Not found.", 404);

  const db = getDb(context);

  // Load source board and verify access.
  const boardRows = await db.select().from(board).where(eq(board.id, boardId)).limit(1);
  const boardRow = boardRows[0];
  if (!boardRow) return apiError("not_found", "That board doesn't exist.", 404);

  const memberRows = await db
    .select()
    .from(boardMember)
    .where(and(eq(boardMember.boardId, boardId), eq(boardMember.userId, org.user.id)))
    .limit(1);
  const memberRole = (memberRows[0]?.role as "view" | "comment" | "edit") ?? null;

  if (boardRow.organizationId !== org.orgId && !memberRole) {
    return apiError("not_found", "That board doesn't exist.", 404);
  }

  const tier = resolveBoardRole(boardRow.createdBy, org.user.id, memberRole, null);
  if (!hasTier(tier, REQUIRED_TIER.mutateItems)) {
    return apiError("forbidden", "You don't have permission to edit items on this board.", 403);
  }

  // Load the item.
  const itemRows = await db
    .select()
    .from(boardItem)
    .where(and(eq(boardItem.id, itemId), eq(boardItem.boardId, boardId)))
    .limit(1);
  const item = itemRows[0];
  if (!item) return apiError("not_found", "That item doesn't exist on this board.", 404);

  const body = await readJson(context.request);
  if (!body) return apiError("bad_request", "Expected a JSON body.", 400);

  const patch: Partial<typeof boardItem.$inferInsert> = {};
  const now = new Date();

  // Note update.
  if ("note" in body) {
    patch.note = optStr(body.note)?.slice(0, 4000) ?? null;
  }

  // Move to another board.
  if ("boardId" in body) {
    const targetBoardId = str(body.boardId);
    if (!targetBoardId) return apiError("bad_request", "`boardId` must be a non-empty string.", 400);
    if (targetBoardId === boardId) {
      // No-op, just continue with other patches.
    } else {
      // Verify caller has edit access to the target board.
      const targetRows = await db.select().from(board).where(eq(board.id, targetBoardId)).limit(1);
      const targetBoard = targetRows[0];
      if (!targetBoard) return apiError("not_found", "Target board doesn't exist.", 404);

      const targetMemberRows = await db
        .select()
        .from(boardMember)
        .where(and(eq(boardMember.boardId, targetBoardId), eq(boardMember.userId, org.user.id)))
        .limit(1);
      const targetMemberRole = (targetMemberRows[0]?.role as "view" | "comment" | "edit") ?? null;

      if (targetBoard.organizationId !== org.orgId && !targetMemberRole) {
        return apiError("not_found", "Target board doesn't exist.", 404);
      }

      const targetTier = resolveBoardRole(targetBoard.createdBy, org.user.id, targetMemberRole, null);
      if (!hasTier(targetTier, REQUIRED_TIER.mutateItems)) {
        return apiError("forbidden", "You don't have permission to add items to the target board.", 403);
      }

      patch.boardId = targetBoardId;
      patch.organizationId = targetBoard.organizationId;
      patch.sortKey = appendKey(); // Append to end of target board.

      // Bump both boards' updatedAt.
      await db.update(board).set({ updatedAt: now }).where(eq(board.id, boardId));
      await db.update(board).set({ updatedAt: now }).where(eq(board.id, targetBoardId));
    }
  }

  // Reorder via beforeId/afterId.
  if ("beforeId" in body || "afterId" in body) {
    const beforeId = optStr(body.beforeId);
    const afterId = optStr(body.afterId);

    let newSortKey: string;

    if (beforeId && afterId) {
      // Between two items: compute midpoint.
      const beforeRow = await db
        .select({ sortKey: boardItem.sortKey })
        .from(boardItem)
        .where(eq(boardItem.id, beforeId))
        .limit(1);
      const afterRow = await db
        .select({ sortKey: boardItem.sortKey })
        .from(boardItem)
        .where(eq(boardItem.id, afterId))
        .limit(1);

      if (!afterRow[0] || !beforeRow[0]) {
        return apiError("bad_request", "One of beforeId/afterId does not exist.", 400);
      }

      // afterId's sortKey should be < beforeId's sortKey (afterId is the item before, beforeId is the item after)
      const lowKey = afterRow[0].sortKey;
      const highKey = beforeRow[0].sortKey;
      if (lowKey >= highKey) {
        return apiError("bad_request", "afterId must sort before beforeId.", 400);
      }
      newSortKey = midKey(lowKey, highKey);
    } else if (afterId && !beforeId) {
      // After a specific item, at the end.
      const afterRow = await db
        .select({ sortKey: boardItem.sortKey })
        .from(boardItem)
        .where(eq(boardItem.id, afterId))
        .limit(1);
      if (!afterRow[0]) return apiError("bad_request", "afterId does not exist.", 400);
      // Place after: use a key larger than the after item.
      newSortKey = afterRow[0].sortKey + "9";
    } else if (beforeId && !afterId) {
      // Before a specific item, at the start.
      const beforeRow = await db
        .select({ sortKey: boardItem.sortKey })
        .from(boardItem)
        .where(eq(boardItem.id, beforeId))
        .limit(1);
      if (!beforeRow[0]) return apiError("bad_request", "beforeId does not exist.", 400);
      // Place before: use midKey between "00000000000" and the before item's key.
      const floor = "0".repeat(beforeRow[0].sortKey.length);
      newSortKey = midKey(floor, beforeRow[0].sortKey);
    } else {
      return apiError("bad_request", "At least one of beforeId or afterId is required for reorder.", 400);
    }

    patch.sortKey = newSortKey;
  }

  if (Object.keys(patch).length === 0) {
    return apiJson({ item: toBoardItemDto(item) });
  }

  const updated = await db.update(boardItem).set(patch).where(eq(boardItem.id, itemId)).returning();
  const updatedItem = updated[0];
  if (!updatedItem) return apiError("not_found", "That item doesn't exist.", 404);

  return apiJson({ item: toBoardItemDto(updatedItem) });
}

/**
 * DELETE /api/v1/boards/:id/items/:itemId — remove an item from a board.
 */
export async function DELETE(context: APIContext): Promise<Response> {
  const org = await requireOrg(context);
  if (org instanceof Response) return org;
  const boardId = context.params.id;
  const itemId = context.params.itemId;
  if (!boardId || !itemId) return apiError("not_found", "Not found.", 404);

  const db = getDb(context);

  // Load board + verify access.
  const boardRows = await db.select().from(board).where(eq(board.id, boardId)).limit(1);
  const boardRow = boardRows[0];
  if (!boardRow) return apiError("not_found", "That board doesn't exist.", 404);

  const memberRows = await db
    .select()
    .from(boardMember)
    .where(and(eq(boardMember.boardId, boardId), eq(boardMember.userId, org.user.id)))
    .limit(1);
  const memberRole = (memberRows[0]?.role as "view" | "comment" | "edit") ?? null;

  if (boardRow.organizationId !== org.orgId && !memberRole) {
    return apiError("not_found", "That board doesn't exist.", 404);
  }

  const tier = resolveBoardRole(boardRow.createdBy, org.user.id, memberRole, null);
  if (!hasTier(tier, REQUIRED_TIER.mutateItems)) {
    return apiError("forbidden", "You don't have permission to remove items from this board.", 403);
  }

  const deleted = await db
    .delete(boardItem)
    .where(and(eq(boardItem.id, itemId), eq(boardItem.boardId, boardId)))
    .returning({ id: boardItem.id });

  if (deleted.length === 0) return apiError("not_found", "That item doesn't exist on this board.", 404);

  // Bump board's updatedAt.
  await db.update(board).set({ updatedAt: new Date() }).where(eq(board.id, boardId));

  return apiJson({ ok: true });
}
