import type { APIContext } from "astro";
import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../../db/client";
import { board, boardItem, boardMember } from "../../../../../db/schema/boards";
import { apiError, apiJson, requireOrg } from "../../../../../lib/auth/guards";
import { intParam, newId, optStr, readJson, str } from "../../../../../lib/api/body";
import { toBoardItemDto, getOrCreateInbox } from "../../../../../lib/boards/queries";
import { resolveBoardRole, hasTier, REQUIRED_TIER } from "../../../../../lib/boards/access";
import { appendKey } from "../../../../../lib/boards/sort-key";

export const prerender = false;

const PAGE_DEFAULT = 200;
const PAGE_MAX = 1000;

/** The literal id clients use to mean "my own Inbox". */
const INBOX_ALIAS = "inbox";

/**
 * Resolve a path id to a real board id.
 *
 * `/boards/inbox/items` is an alias for the caller's own Inbox board. It exists
 * so the chat generation flow can post a finished doodle in ONE request — the
 * alternative was GET /api/v1/boards first just to learn the inbox's id, i.e.
 * an extra round trip on the hot path of every single generation.
 *
 * getOrCreateInbox is idempotent, so this also self-heals an account that
 * somehow has no inbox row.
 */
async function resolveBoardId(
  db: ReturnType<typeof getDb>,
  rawId: string,
  userId: string,
  orgId: string,
): Promise<string> {
  if (rawId !== INBOX_ALIAS) return rawId;
  const inbox = await getOrCreateInbox(db, userId, orgId);
  return inbox.id;
}

/**
 * GET /api/v1/boards/:id/items — items ordered by sortKey.
 */
export async function GET(context: APIContext): Promise<Response> {
  const org = await requireOrg(context);
  if (org instanceof Response) return org;
  const rawId = context.params.id;
  if (!rawId) return apiError("not_found", "That board doesn't exist.", 404);

  const db = getDb(context);
  const boardId = await resolveBoardId(db, rawId, org.user.id, org.orgId);

  // Load board + verify access.
  const boardRows = await db.select().from(board).where(eq(board.id, boardId)).limit(1);
  const boardRow = boardRows[0];
  if (!boardRow) return apiError("not_found", "That board doesn't exist.", 404);

  // Access check: same org or member.
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
  if (!tier) return apiError("not_found", "That board doesn't exist.", 404);

  const url = new URL(context.request.url);
  const limit = intParam(url, "limit", PAGE_DEFAULT, PAGE_MAX);

  const items = await db
    .select()
    .from(boardItem)
    .where(eq(boardItem.boardId, boardId))
    .orderBy(boardItem.sortKey)
    .limit(limit);

  return apiJson({ items: items.map(toBoardItemDto) });
}

/**
 * POST /api/v1/boards/:id/items — add an item.
 *
 * `{ url, kind?, generationId?, characterId?, width?, height? }`
 *
 * De-duplicates on (boardId, url) via the unique index: re-adding the same
 * URL is a no-op 200, not a 409.
 */
export async function POST(context: APIContext): Promise<Response> {
  const org = await requireOrg(context);
  if (org instanceof Response) return org;
  const rawId = context.params.id;
  if (!rawId) return apiError("not_found", "That board doesn't exist.", 404);

  const db = getDb(context);
  const boardId = await resolveBoardId(db, rawId, org.user.id, org.orgId);

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
    return apiError("forbidden", "You don't have permission to add items to this board.", 403);
  }

  const body = await readJson(context.request);
  const url = body ? str(body.url) : null;
  if (!url) return apiError("bad_request", "`url` is required.", 400);

  // Validate kind.
  const kind = (body?.kind as string) ?? "generation";
  if (!["generation", "reference", "upload"].includes(kind)) {
    return apiError("bad_request", "`kind` must be 'generation', 'reference', or 'upload'.", 400);
  }

  // Dedupe: re-adding same URL to same board is a no-op.
  const existing = await db
    .select()
    .from(boardItem)
    .where(and(eq(boardItem.boardId, boardId), eq(boardItem.url, url)))
    .limit(1);
  if (existing[0]) return apiJson({ item: toBoardItemDto(existing[0]) });

  const now = new Date();
  const values = {
    id: newId(),
    boardId,
    organizationId: boardRow.organizationId,
    url,
    kind,
    generationId: optStr(body?.generationId) ?? null,
    characterId: optStr(body?.characterId) ?? null,
    note: null,
    sortKey: appendKey(),
    width: typeof body?.width === "number" ? Math.floor(body.width) : null,
    height: typeof body?.height === "number" ? Math.floor(body.height) : null,
    createdBy: org.user.id,
    createdAt: now,
  } satisfies typeof boardItem.$inferInsert;

  await db.insert(boardItem).values(values);

  // Bump board's updatedAt.
  await db.update(board).set({ updatedAt: now }).where(eq(board.id, boardId));

  return apiJson({ item: toBoardItemDto(values as unknown as typeof boardItem.$inferSelect) }, 201);
}
