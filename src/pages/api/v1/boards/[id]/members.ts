import type { APIContext } from "astro";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "../../../../../db/client";
import { board, boardMember, type BoardRole } from "../../../../../db/schema/boards";
import { user } from "../../../../../db/schema/auth";
import { apiError, apiJson, requireOrg } from "../../../../../lib/auth/guards";
import { readJson, str } from "../../../../../lib/api/body";
import { resolveBoardRole, hasTier, REQUIRED_TIER } from "../../../../../lib/boards/access";
import { BOARD_ROLES } from "../../../../../db/schema/boards";

export const prerender = false;

interface BoardMemberDto {
  userId: string;
  name: string;
  email: string;
  image: string | null;
  role: string;
  createdAt: number;
}

/**
 * GET /api/v1/boards/:id/members — list all explicit collaborators.
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

  // Must be owner to see member list.
  const tier = resolveBoardRole(boardRow.createdBy, org.user.id, null, null);
  if (!hasTier(tier, REQUIRED_TIER.manageMembers)) {
    // Non-owners can still see the board but not its member list.
    // Check if they have any access at all.
    const myMembership = await db
      .select()
      .from(boardMember)
      .where(and(eq(boardMember.boardId, boardId), eq(boardMember.userId, org.user.id)))
      .limit(1);
    if (boardRow.organizationId !== org.orgId && !myMembership[0]) {
      return apiError("not_found", "That board doesn't exist.", 404);
    }
    return apiError("forbidden", "Only the board owner can manage members.", 403);
  }

  const rows = await db
    .select({
      userId: boardMember.userId,
      role: boardMember.role,
      createdAt: boardMember.createdAt,
      name: user.name,
      email: user.email,
      image: user.image,
    })
    .from(boardMember)
    .innerJoin(user, eq(user.id, boardMember.userId))
    .where(eq(boardMember.boardId, boardId));

  const members: BoardMemberDto[] = rows.map((r) => ({
    userId: r.userId,
    name: r.name,
    email: r.email,
    image: r.image ?? null,
    role: r.role,
    createdAt: r.createdAt.getTime(),
  }));

  return apiJson({ members });
}

/**
 * POST /api/v1/boards/:id/members — invite a collaborator.
 *
 * `{ email }` or `{ userId }`, plus `role: 'view'|'comment'|'edit'`.
 *
 * `email` is the path the UI uses, because nobody knows another person's
 * internal user id — asking for one in a share sheet is an unusable form.
 * `userId` is retained for programmatic callers.
 *
 * KNOWN TRADEOFF: an email with no matching account gets a specific 404
 * ("no account uses that address") rather than a generic failure. That is a
 * deliberate UX choice — the alternative leaves the owner unable to tell a typo
 * from a real problem — but it does mean a board owner can use this endpoint to
 * learn whether a given address has a Doodle AI account. It is owner-only and
 * unauthenticated callers get 401, so the exposure is limited to signed-in
 * board owners. If that is ever judged too weak, the fix is NOT a vaguer error:
 * it is to accept the invite and send an email, so no lookup result is ever
 * reflected back to the caller at all.
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

  if (boardRow.organizationId !== org.orgId) {
    return apiError("not_found", "That board doesn't exist.", 404);
  }

  const tier = resolveBoardRole(boardRow.createdBy, org.user.id, null, null);
  if (!hasTier(tier, REQUIRED_TIER.manageMembers)) {
    return apiError("forbidden", "Only the board owner can manage members.", 403);
  }

  const body = await readJson(context.request);
  const rawEmail = body ? str(body.email) : null;
  const rawUserId = body ? str(body.userId) : null;
  if (!rawEmail && !rawUserId) {
    return apiError("bad_request", "Provide an `email` (or a `userId`) to invite.", 400);
  }

  const role = (body?.role as string) ?? "view";
  if (!BOARD_ROLES.includes(role as BoardRole)) {
    return apiError("bad_request", "`role` must be 'view', 'comment', or 'edit'.", 400);
  }

  // Resolve to a user id. Email is matched case-insensitively — addresses are
  // stored as the provider supplied them, so a typed "Sam@Example.com" would
  // otherwise fail against a stored "sam@example.com".
  let targetUserId: string;
  if (rawEmail) {
    const byEmail = await db
      .select({ id: user.id })
      .from(user)
      .where(sql`lower(${user.email}) = ${rawEmail.trim().toLowerCase()}`)
      .limit(1);
    if (byEmail.length === 0) {
      return apiError("not_found", "No Doodle AI account uses that email address.", 404);
    }
    targetUserId = byEmail[0].id;
  } else {
    const byId = await db.select({ id: user.id }).from(user).where(eq(user.id, rawUserId!)).limit(1);
    if (byId.length === 0) return apiError("not_found", "That user doesn't exist.", 404);
    targetUserId = byId[0].id;
  }

  // Cannot add yourself as member (you're the owner).
  if (targetUserId === org.user.id) {
    return apiError("bad_request", "You are the owner — no membership row needed.", 400);
  }

  // Upsert: update role if already a member.
  const existing = await db
    .select()
    .from(boardMember)
    .where(and(eq(boardMember.boardId, boardId), eq(boardMember.userId, targetUserId)))
    .limit(1);

  if (existing[0]) {
    await db
      .update(boardMember)
      .set({ role })
      .where(and(eq(boardMember.boardId, boardId), eq(boardMember.userId, targetUserId)));
    return apiJson({ member: { userId: targetUserId, role }, updated: true });
  }

  await db.insert(boardMember).values({
    boardId,
    userId: targetUserId,
    role,
    invitedBy: org.user.id,
    createdAt: new Date(),
  });

  return apiJson({ member: { userId: targetUserId, role }, updated: false }, 201);
}

/**
 * DELETE /api/v1/boards/:id/members?userId=... — remove a collaborator.
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

  if (boardRow.organizationId !== org.orgId) {
    return apiError("not_found", "That board doesn't exist.", 404);
  }

  const tier = resolveBoardRole(boardRow.createdBy, org.user.id, null, null);
  if (!hasTier(tier, REQUIRED_TIER.manageMembers)) {
    return apiError("forbidden", "Only the board owner can manage members.", 403);
  }

  const url = new URL(context.request.url);
  const targetUserId = url.searchParams.get("userId");
  if (!targetUserId) return apiError("bad_request", "`userId` query param is required.", 400);

  const deleted = await db
    .delete(boardMember)
    .where(and(eq(boardMember.boardId, boardId), eq(boardMember.userId, targetUserId)))
    .returning({ boardId: boardMember.boardId });

  if (deleted.length === 0) {
    return apiError("not_found", "That user is not a member of this board.", 404);
  }

  return apiJson({ ok: true });
}
