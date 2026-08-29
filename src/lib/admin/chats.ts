/**
 * Admin chat-session queries — list, filters, search, and full transcript.
 *
 * The product owner reads these to see what users actually asked for and what
 * the app generated. Nothing here mutates; this is a pure read surface.
 *
 * Correlated scalar subqueries per row (message count, generation count,
 * successful-generation count, first user message) rather than GROUP BY joins,
 * for the same reason listUsers uses them: joining `thread` to `message` and
 * `generation` at once multiplies rows, and the list is paginated to 50 so it
 * is a bounded number of indexed lookups. `message_thread_created_idx` and
 * `generation` indices cover them.
 */
import { and, count, desc, eq, sql } from "drizzle-orm";
import type { Db } from "../../db/client";
import { user } from "../../db/schema/auth";
import { generation, message, thread } from "../../db/schema/product";
import { num } from "./shared";

/**
 * Filter chips.
 *   all            — every thread.
 *   with_gen       — at least one successful ('ok') generation.
 *   abandoned      — zero successful generations (the key product signal:
 *                    what users tried but never got a result for).
 *   has_failure    — at least one 'failed' generation.
 */
export type ChatFilter = "all" | "with_gen" | "abandoned" | "has_failure";

export interface AdminChatRow {
  id: string;
  title: string;
  skillId: string | null;
  thumbnailUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
  userId: string;
  userName: string | null;
  userEmail: string | null;
  messageCount: number;
  generationCount: number;
  okGenerationCount: number;
  firstUserMessage: string | null;
}

export interface ChatListResult {
  rows: AdminChatRow[];
  total: number;
  filterCounts: Record<ChatFilter, number>;
}

export interface ChatMessageRow {
  id: string;
  role: string;
  content: string;
  imageUrl: string | null;
  refImageUrl: string | null;
  images: string[] | null;
  createdAt: Date;
}

export interface ChatGenerationStat {
  status: string;
  count: number;
}

export interface AdminChatDetail {
  id: string;
  title: string;
  skillId: string | null;
  createdAt: Date;
  updatedAt: Date;
  userId: string;
  userName: string | null;
  userEmail: string | null;
  userImage: string | null;
  messageCount: number;
  generationCount: number;
  generationStats: ChatGenerationStat[];
  messages: ChatMessageRow[];
}

/* Correlated subqueries reused by list and counts. */
const okGenCountSql = sql<number>`(
  SELECT COUNT(*) FROM ${generation}
  WHERE ${generation.threadId} = ${thread.id} AND ${generation.status} = 'ok'
)`;
const genCountSql = sql<number>`(
  SELECT COUNT(*) FROM ${generation} WHERE ${generation.threadId} = ${thread.id}
)`;
const failCountSql = sql<number>`(
  SELECT COUNT(*) FROM ${generation}
  WHERE ${generation.threadId} = ${thread.id} AND ${generation.status} = 'failed'
)`;
const msgCountSql = sql<number>`(
  SELECT COUNT(*) FROM ${message} WHERE ${message.threadId} = ${thread.id}
)`;
const firstUserMsgSql = sql<string | null>`(
  SELECT ${message.content} FROM ${message}
  WHERE ${message.threadId} = ${thread.id} AND ${message.role} = 'user'
  ORDER BY ${message.createdAt} ASC LIMIT 1
)`;

/**
 * Search matches message content OR the thread owner's email — the owner wants
 * to search what users asked for, and to pull up a specific person's chats.
 * Content is matched via an EXISTS subquery so a thread surfaces if ANY of its
 * messages hit, without duplicating the row.
 */
function searchFilter(q: string) {
  const like = `%${q.toLowerCase()}%`;
  return sql`(
    LOWER(${user.email}) LIKE ${like}
    OR EXISTS (
      SELECT 1 FROM ${message}
      WHERE ${message.threadId} = ${thread.id} AND LOWER(${message.content}) LIKE ${like}
    )
  )`;
}

export async function listChats(
  db: Db,
  opts: { filter?: ChatFilter; q?: string; limit?: number; offset?: number } = {},
): Promise<ChatListResult> {
  const { filter = "all", q, limit = 50, offset = 0 } = opts;

  const filters = [];
  if (q) filters.push(searchFilter(q));
  if (filter === "with_gen") filters.push(sql`${okGenCountSql} > 0`);
  if (filter === "abandoned") filters.push(sql`${okGenCountSql} = 0`);
  if (filter === "has_failure") filters.push(sql`${failCountSql} > 0`);

  const where = filters.length > 0 ? and(...filters) : undefined;

  const rows = await db
    .select({
      id: thread.id,
      title: thread.title,
      skillId: thread.skillId,
      thumbnailUrl: thread.thumbnailUrl,
      createdAt: thread.createdAt,
      updatedAt: thread.updatedAt,
      userId: thread.userId,
      userName: user.name,
      userEmail: user.email,
      messageCount: msgCountSql.as("message_count"),
      generationCount: genCountSql.as("generation_count"),
      okGenerationCount: okGenCountSql.as("ok_generation_count"),
      firstUserMessage: firstUserMsgSql.as("first_user_message"),
    })
    .from(thread)
    .leftJoin(user, eq(thread.userId, user.id))
    .where(where)
    .orderBy(desc(thread.updatedAt))
    .limit(limit)
    .offset(offset);

  // Chip counts are search-scoped: a count that ignored the active search would
  // contradict the filtered list under it. Direct counts from `thread` with the
  // correlated subquery in the WHERE clause — the same shape listUsers uses,
  // rather than counting over a derived table. `search` is applied to every one.
  const search = q ? searchFilter(q) : undefined;
  const [totalRows, withGenRows, abandonedRows, failureRows] = await db.batch([
    db.select({ n: count() }).from(thread).leftJoin(user, eq(thread.userId, user.id)).where(search),
    db
      .select({ n: count() })
      .from(thread)
      .leftJoin(user, eq(thread.userId, user.id))
      .where(and(sql`${okGenCountSql} > 0`, search)),
    db
      .select({ n: count() })
      .from(thread)
      .leftJoin(user, eq(thread.userId, user.id))
      .where(and(sql`${okGenCountSql} = 0`, search)),
    db
      .select({ n: count() })
      .from(thread)
      .leftJoin(user, eq(thread.userId, user.id))
      .where(and(sql`${failCountSql} > 0`, search)),
  ]);

  const total = num(totalRows[0]?.n);

  return {
    rows: rows.map((r) => ({
      id: r.id,
      title: r.title,
      skillId: r.skillId ?? null,
      thumbnailUrl: r.thumbnailUrl ?? null,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      userId: r.userId,
      userName: r.userName ?? null,
      userEmail: r.userEmail ?? null,
      messageCount: num(r.messageCount),
      generationCount: num(r.generationCount),
      okGenerationCount: num(r.okGenerationCount),
      firstUserMessage: r.firstUserMessage ?? null,
    })),
    total,
    filterCounts: {
      all: total,
      with_gen: num(withGenRows[0]?.n),
      abandoned: num(abandonedRows[0]?.n),
      has_failure: num(failureRows[0]?.n),
    },
  };
}

/**
 * A single thread's header summary plus its full ordered transcript. Returns
 * null when the thread id does not exist. A thread with zero messages returns
 * an empty `messages` array — the drawer renders an explicit empty state.
 */
export async function getChatDetail(db: Db, threadId: string): Promise<AdminChatDetail | null> {
  const base = await db
    .select({
      id: thread.id,
      title: thread.title,
      skillId: thread.skillId,
      createdAt: thread.createdAt,
      updatedAt: thread.updatedAt,
      userId: thread.userId,
      userName: user.name,
      userEmail: user.email,
      userImage: user.image,
    })
    .from(thread)
    .leftJoin(user, eq(thread.userId, user.id))
    .where(eq(thread.id, threadId))
    .limit(1);

  const found = base[0];
  if (!found) return null;

  const messages = await db
    .select({
      id: message.id,
      role: message.role,
      content: message.content,
      imageUrl: message.imageUrl,
      refImageUrl: message.refImageUrl,
      images: message.images,
      createdAt: message.createdAt,
    })
    .from(message)
    .where(eq(message.threadId, threadId))
    .orderBy(message.createdAt);

  const [genTotalRows, statusRows] = await db.batch([
    db.select({ n: count() }).from(generation).where(eq(generation.threadId, threadId)),
    db
      .select({ status: generation.status, n: count() })
      .from(generation)
      .where(eq(generation.threadId, threadId))
      .groupBy(generation.status)
      .orderBy(desc(count())),
  ]);

  return {
    id: found.id,
    title: found.title,
    skillId: found.skillId ?? null,
    createdAt: found.createdAt,
    updatedAt: found.updatedAt,
    userId: found.userId,
    userName: found.userName ?? null,
    userEmail: found.userEmail ?? null,
    userImage: found.userImage ?? null,
    messageCount: messages.length,
    generationCount: num(genTotalRows[0]?.n),
    generationStats: statusRows.map((r) => ({ status: r.status, count: num(r.n) })),
    messages: messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      imageUrl: m.imageUrl ?? null,
      refImageUrl: m.refImageUrl ?? null,
      images: (m.images as string[] | null) ?? null,
      createdAt: m.createdAt,
    })),
  };
}
