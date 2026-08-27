/**
 * Board data-access layer — the queries behind the /api/v1/boards routes.
 *
 * Design decisions:
 *   - getOrCreateInbox: mirrors requireOrg's self-heal pattern — idempotent,
 *     deterministic id, no partial-index hack.
 *   - listBoards: single round-trip using a window function for the 4-newest
 *     cover items, avoiding N+1.
 */
import { and, count, desc, eq, isNull, or, sql } from "drizzle-orm";
import type { Db } from "../../db/client";
import { board, boardItem, boardMember } from "../../db/schema/boards";
import { newId } from "../api/body";

// ─── DTOs ────────────────────────────────────────────────────────────────────

export interface BoardItemPreview {
  id: string;
  url: string;
}

export interface BoardListEntry {
  id: string;
  name: string;
  description: string | null;
  kind: string;
  viewMode: string;
  itemCount: number;
  coverItems: BoardItemPreview[];
  /** True if the caller has this board via boardMember, not as owner. */
  shared: boolean;
  archivedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface BoardDetail {
  id: string;
  name: string;
  description: string | null;
  kind: string;
  viewMode: string;
  createdBy: string;
  archivedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface BoardItemDto {
  id: string;
  url: string;
  kind: string;
  generationId: string | null;
  characterId: string | null;
  note: string | null;
  sortKey: string;
  width: number | null;
  height: number | null;
  createdBy: string;
  createdAt: number;
}

// ─── getOrCreateInbox ────────────────────────────────────────────────────────

/**
 * Returns the caller's kind='inbox' board, creating it if absent.
 *
 * Inbox uniqueness is enforced in app code, not by a DB constraint — mirrors
 * the self-heal pattern in requireOrg (see src/lib/auth/guards.ts header).
 * The id is deterministic (`inbox_<userId>`) so concurrent creates converge.
 */
export async function getOrCreateInbox(
  db: Db,
  userId: string,
  orgId: string,
): Promise<typeof board.$inferSelect> {
  // Fast path: the inbox already exists.
  const existing = await db
    .select()
    .from(board)
    .where(and(eq(board.createdBy, userId), eq(board.kind, "inbox")))
    .limit(1);

  if (existing[0]) return existing[0];

  // Create with a deterministic id so a race between two concurrent requests
  // does not produce two inboxes — the second insert is a no-op.
  const now = new Date();
  const values = {
    id: `inbox_${userId}`,
    organizationId: orgId,
    createdBy: userId,
    name: "Inbox",
    description: null,
    kind: "inbox",
    viewMode: "grid",
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
  } satisfies typeof board.$inferInsert;

  await db.insert(board).values(values).onConflictDoNothing({ target: board.id });

  // Re-read in case the insert was a no-op (concurrent create by another req).
  const rows = await db.select().from(board).where(eq(board.id, values.id)).limit(1);
  return rows[0] ?? (values as unknown as typeof board.$inferSelect);
}

// ─── listBoards ──────────────────────────────────────────────────────────────

/**
 * All boards the caller can see: owned boards + boards they are a member of.
 * Returns each with a 4-item cover mosaic and a total item count, in as few
 * queries as possible.
 *
 * Strategy:
 *   1. Fetch the board rows (owned + shared) ordered by updatedAt desc, inbox first.
 *   2. One query with ROW_NUMBER() window to get the 4 newest items per board.
 *   3. One query for total counts per board.
 *
 * This is 3 round trips regardless of board count — no N+1.
 */
export async function listBoards(
  db: Db,
  userId: string,
  orgId: string,
  opts: { includeArchived?: boolean } = {},
): Promise<BoardListEntry[]> {
  // Step 1: board rows the caller can see.
  const archiveFilter = opts.includeArchived ? undefined : isNull(board.archivedAt);
  const ownedCondition = and(eq(board.organizationId, orgId), eq(board.createdBy, userId), archiveFilter);

  // Boards I'm a member of (shared with me).
  const memberBoardIds = db
    .select({ boardId: boardMember.boardId })
    .from(boardMember)
    .where(eq(boardMember.userId, userId));

  // Combine: owned OR member-of. Two queries to avoid a complex union that
  // drizzle's D1 driver may not optimize well.
  const ownedRows = await db
    .select()
    .from(board)
    .where(ownedCondition)
    .orderBy(desc(board.updatedAt));

  const sharedRows = await db
    .select()
    .from(board)
    .where(and(
      sql`${board.id} IN (${memberBoardIds})`,
      archiveFilter ?? sql`1=1`,
    ))
    .orderBy(desc(board.updatedAt));

  // Merge, marking shared boards. Deduplicate (owner who is also a member).
  const seen = new Set<string>();
  const allBoards: { row: typeof board.$inferSelect; shared: boolean }[] = [];

  for (const row of ownedRows) {
    seen.add(row.id);
    allBoards.push({ row, shared: false });
  }
  for (const row of sharedRows) {
    if (!seen.has(row.id)) {
      seen.add(row.id);
      allBoards.push({ row, shared: true });
    }
  }

  if (allBoards.length === 0) return [];

  // Sort: inbox first, then by updatedAt desc.
  allBoards.sort((a, b) => {
    if (a.row.kind === "inbox" && b.row.kind !== "inbox") return -1;
    if (b.row.kind === "inbox" && a.row.kind !== "inbox") return 1;
    return (b.row.updatedAt?.getTime() ?? 0) - (a.row.updatedAt?.getTime() ?? 0);
  });

  const boardIds = allBoards.map((b) => b.row.id);

  // Step 2: 4 newest items per board via window function.
  // D1/SQLite supports ROW_NUMBER() OVER (PARTITION BY ... ORDER BY ...).
  const coverQuery = sql`
    SELECT id, board_id, url
    FROM (
      SELECT id, board_id, url,
             ROW_NUMBER() OVER (PARTITION BY board_id ORDER BY created_at DESC) AS rn
      FROM board_item
      WHERE board_id IN (${sql.join(boardIds.map((id) => sql`${id}`), sql`, `)})
    ) sub
    WHERE rn <= 4
  `;
  const coverRows = await db.all<{ id: string; board_id: string; url: string }>(coverQuery);

  // Step 3: total item counts per board.
  const countQuery = sql`
    SELECT board_id, COUNT(*) as cnt
    FROM board_item
    WHERE board_id IN (${sql.join(boardIds.map((id) => sql`${id}`), sql`, `)})
    GROUP BY board_id
  `;
  const countRows = await db.all<{ board_id: string; cnt: number }>(countQuery);

  // Index results.
  const coverByBoard = new Map<string, BoardItemPreview[]>();
  for (const r of coverRows) {
    const arr = coverByBoard.get(r.board_id) ?? [];
    arr.push({ id: r.id, url: r.url });
    coverByBoard.set(r.board_id, arr);
  }

  const countByBoard = new Map<string, number>();
  for (const r of countRows) {
    countByBoard.set(r.board_id, r.cnt);
  }

  // Assemble response.
  return allBoards.map(({ row, shared }) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    kind: row.kind,
    viewMode: row.viewMode,
    itemCount: countByBoard.get(row.id) ?? 0,
    coverItems: coverByBoard.get(row.id) ?? [],
    shared,
    archivedAt: row.archivedAt?.getTime() ?? null,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  }));
}

// ─── Board detail helpers ────────────────────────────────────────────────────

export function toBoardDetail(row: typeof board.$inferSelect): BoardDetail {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    kind: row.kind,
    viewMode: row.viewMode,
    createdBy: row.createdBy,
    archivedAt: row.archivedAt?.getTime() ?? null,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  };
}

export function toBoardItemDto(row: typeof boardItem.$inferSelect): BoardItemDto {
  return {
    id: row.id,
    url: row.url,
    kind: row.kind,
    generationId: row.generationId,
    characterId: row.characterId,
    note: row.note,
    sortKey: row.sortKey,
    width: row.width,
    height: row.height,
    createdBy: row.createdBy,
    createdAt: row.createdAt.getTime(),
  };
}
