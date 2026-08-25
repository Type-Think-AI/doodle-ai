import type { APIContext } from "astro";
import { and, desc, eq, exists, lt, sql } from "drizzle-orm";
import { getDb, withDbSession } from "../../../db/client";
import { message, thread } from "../../../db/schema/product";
import { apiJson, requireOrg } from "../../../lib/auth/guards";
import { intParam, newId, optStr, readJson, toDate } from "../../../lib/api/body";

export const prerender = false;

/** Matches TITLE_MAX_LEN in src/scripts/app/chat-store.ts. */
const TITLE_MAX_LEN = 48;
const PAGE_DEFAULT = 200;
const PAGE_MAX = 500;

export interface ThreadDto {
  id: string;
  title: string;
  updatedAt: number;
  createdAt: number;
  skillId?: string;
  thumbnailUrl?: string;
}

export function toThreadDto(row: typeof thread.$inferSelect): ThreadDto {
  return {
    id: row.id,
    title: row.title,
    updatedAt: row.updatedAt.getTime(),
    createdAt: row.createdAt.getTime(),
    ...(row.skillId ? { skillId: row.skillId } : {}),
    ...(row.thumbnailUrl ? { thumbnailUrl: row.thumbnailUrl } : {}),
  };
}

/**
 * GET /api/v1/threads — the caller's team's threads, newest first.
 *
 * B2B note: scoped to the active organization, not the caller alone —
 * "Recents" in the sidebar is per-team, which is what makes switching teams
 * (src/scripts/app/api-client.ts's switchOrg()) visibly change the list. A
 * solo user's personal org behaves exactly like the old per-user scoping,
 * since they're that org's only member.
 *
 * Paginated by `updatedAt` rather than by offset: the list is re-sorted on
 * every append, so an offset cursor would skip and repeat rows.
 * `?before=<epoch ms>` continues from the last row of the previous page.
 *
 * Excludes threads with zero messages — a brand-new chat the user clicked
 * into but never sent anything in is clutter, not history. (chat-store.ts's
 * `createThread()` still creates the row immediately, for reasons unrelated
 * to this list — it's just not shown here until it has content.)
 */
export async function GET(context: APIContext): Promise<Response> {
  const org = await requireOrg(context);
  if (org instanceof Response) return org;

  const url = new URL(context.request.url);
  const limit = intParam(url, "limit", PAGE_DEFAULT, PAGE_MAX);
  const before = url.searchParams.get("before");
  const beforeDate = before ? new Date(Number.parseInt(before, 10)) : null;

  const { db, commit } = withDbSession(context);
  const rows = await db
    .select()
    .from(thread)
    .where(
      and(
        eq(thread.organizationId, org.orgId),
        beforeDate && !Number.isNaN(beforeDate.getTime()) ? lt(thread.updatedAt, beforeDate) : undefined,
        exists(db.select({ one: sql`1` }).from(message).where(eq(message.threadId, thread.id))),
      ),
    )
    .orderBy(desc(thread.updatedAt))
    .limit(limit);

  return commit(apiJson({ threads: rows.map(toThreadDto) }));
}

/**
 * POST /api/v1/threads — create a thread.
 *
 * The client may supply its own `id` so an optimistic local row and the
 * server row agree; a collision with a thread that is not in the caller's
 * org is resolved by minting a fresh id rather than by failing, since the
 * client has no way to know another team already holds that uuid.
 */
export async function POST(context: APIContext): Promise<Response> {
  const org = await requireOrg(context, { generation: ["create"] });
  if (org instanceof Response) return org;

  const body = (await readJson(context.request)) ?? {};
  const db = getDb(context);
  const now = Date.now();

  const requestedId = optStr(body.id);
  let id = requestedId ?? newId();
  if (requestedId) {
    const existing = await db
      .select({ id: thread.id, organizationId: thread.organizationId })
      .from(thread)
      .where(eq(thread.id, requestedId))
      .limit(1);
    const row = existing[0];
    if (row && row.organizationId === org.orgId) {
      // Idempotent re-create (a retried request) — return what is already there.
      const full = await db.select().from(thread).where(eq(thread.id, requestedId)).limit(1);
      return apiJson({ thread: toThreadDto(full[0]!) }, 200);
    }
    if (row) id = newId();
  }

  const values = {
    id,
    userId: org.user.id,
    organizationId: org.orgId,
    projectId: optStr(body.projectId) ?? null,
    title: (optStr(body.title) ?? "New chat").slice(0, TITLE_MAX_LEN),
    skillId: optStr(body.skillId),
    thumbnailUrl: null,
    createdAt: toDate(body.createdAt, now),
    updatedAt: toDate(body.updatedAt, now),
  };
  await db.insert(thread).values(values);

  return apiJson({ thread: toThreadDto(values) }, 201);
}
