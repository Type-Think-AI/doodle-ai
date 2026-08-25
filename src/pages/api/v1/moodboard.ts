import type { APIContext } from "astro";
import { and, desc, eq } from "drizzle-orm";
import { getDb, withDbSession } from "../../../db/client";
import { moodboardItem } from "../../../db/schema/product";
import { apiError, apiJson, requireOrg } from "../../../lib/auth/guards";
import { intParam, newId, optStr, readJson, str, toDate } from "../../../lib/api/body";

export const prerender = false;

/**
 * No 24-item cap here — that limit exists on the client only because a
 * localStorage moodboard shares a ~5 MB origin quota with the chat history.
 * A page size still applies so one enormous board cannot blow the response.
 */
const PAGE_DEFAULT = 500;
const PAGE_MAX = 1000;

export interface MoodboardItemDto {
  id: string;
  url: string;
  createdAt: number;
}

function toDto(row: typeof moodboardItem.$inferSelect): MoodboardItemDto {
  return { id: row.id, url: row.url, createdAt: row.createdAt.getTime() };
}

/**
 * GET /api/v1/moodboard — newest first, matching the client's unshift order.
 *
 * B2B note: this is the team's shared scratch inspiration board —
 * org-scoped, every member sees every item any member saved (see the
 * taxonomy note in src/db/schema/product.ts).
 */
export async function GET(context: APIContext): Promise<Response> {
  const org = await requireOrg(context, { asset: ["read"] });
  if (org instanceof Response) return org;

  const limit = intParam(new URL(context.request.url), "limit", PAGE_DEFAULT, PAGE_MAX);
  const { db, commit } = withDbSession(context);
  const rows = await db
    .select()
    .from(moodboardItem)
    .where(eq(moodboardItem.organizationId, org.orgId))
    .orderBy(desc(moodboardItem.createdAt))
    .limit(limit);

  return commit(apiJson({ items: rows.map(toDto) }));
}

/**
 * POST /api/v1/moodboard — save a doodle.
 *
 * De-duplicates on `url` per org, mirroring `addToMoodboard`: the chat page
 * re-renders a thread's whole history on load and auto-saves every generated
 * image, so without this a revisited thread refills the board with its own
 * doodles.
 */
export async function POST(context: APIContext): Promise<Response> {
  const org = await requireOrg(context, { asset: ["create"] });
  if (org instanceof Response) return org;

  const body = await readJson(context.request);
  const url = body ? str(body.url) : null;
  if (!url) return apiError("bad_request", "`url` is required.", 400);

  const db = getDb(context);
  const existing = await db
    .select()
    .from(moodboardItem)
    .where(and(eq(moodboardItem.organizationId, org.orgId), eq(moodboardItem.url, url)))
    .limit(1);
  const already = existing[0];
  if (already) return apiJson({ item: toDto(already) });

  const values = {
    id: optStr(body?.id) ?? newId(),
    userId: org.user.id,
    organizationId: org.orgId,
    url,
    generationId: null,
    createdAt: toDate(body?.createdAt, Date.now()),
  };
  await db.insert(moodboardItem).values(values).onConflictDoNothing({ target: moodboardItem.id });

  return apiJson({ item: toDto(values) }, 201);
}

/** DELETE /api/v1/moodboard?id=… — scoped to the caller's team. */
export async function DELETE(context: APIContext): Promise<Response> {
  const org = await requireOrg(context, { asset: ["delete"] });
  if (org instanceof Response) return org;

  const url = new URL(context.request.url);
  const id = url.searchParams.get("id") ?? (await readJson(context.request).then((b) => (b ? str(b.id) : null)));
  if (!id) return apiError("bad_request", "`id` is required.", 400);

  const db = getDb(context);
  const deleted = await db
    .delete(moodboardItem)
    .where(and(eq(moodboardItem.id, id), eq(moodboardItem.organizationId, org.orgId)))
    .returning({ id: moodboardItem.id });

  if (deleted.length === 0) return apiError("not_found", "That moodboard item doesn't exist.", 404);
  return apiJson({ ok: true });
}
