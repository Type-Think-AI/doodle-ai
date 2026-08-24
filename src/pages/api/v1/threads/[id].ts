import type { APIContext } from "astro";
import { and, eq } from "drizzle-orm";
import { getDb, withDbSession } from "../../../../db/client";
import { thread } from "../../../../db/schema/product";
import { apiError, apiJson, requireAuth } from "../../../../lib/auth/guards";
import { optStr, readJson } from "../../../../lib/api/body";
import { toThreadDto } from "../threads";

export const prerender = false;

const TITLE_MAX_LEN = 48;

/**
 * A thread that is not the caller's reads as 404, never 403.
 *
 * 403 would confirm that the id exists, which is exactly the probe an
 * attacker enumerating ids is making. `forbidden` stays reserved for cases
 * where the caller already legitimately knows the resource exists.
 */
function notFound(): Response {
  return apiError("not_found", "That chat doesn't exist.", 404);
}

export async function GET(context: APIContext): Promise<Response> {
  const user = await requireAuth(context);
  if (user instanceof Response) return user;
  const id = context.params.id;
  if (!id) return notFound();

  const { db, commit } = withDbSession(context);
  const rows = await db
    .select()
    .from(thread)
    .where(and(eq(thread.id, id), eq(thread.userId, user.id)))
    .limit(1);

  const row = rows[0];
  if (!row) return commit(notFound());
  return commit(apiJson({ thread: toThreadDto(row) }));
}

/** PATCH /api/v1/threads/:id — title and/or pinned skill. */
export async function PATCH(context: APIContext): Promise<Response> {
  const user = await requireAuth(context);
  if (user instanceof Response) return user;
  const id = context.params.id;
  if (!id) return notFound();

  const body = await readJson(context.request);
  if (!body) return apiError("bad_request", "Expected a JSON body.", 400);

  const patch: Partial<typeof thread.$inferInsert> = { updatedAt: new Date() };
  if ("title" in body) patch.title = (optStr(body.title) ?? "New chat").slice(0, TITLE_MAX_LEN);
  // `skillId: null` is the unpin signal, so presence of the key matters here
  // rather than truthiness of the value.
  if ("skillId" in body) patch.skillId = optStr(body.skillId);

  const db = getDb(context);
  // The userId predicate is what makes this safe: a row belonging to someone
  // else updates nothing, and `returning()` reports which happened without a
  // prior read.
  const updated = await db
    .update(thread)
    .set(patch)
    .where(and(eq(thread.id, id), eq(thread.userId, user.id)))
    .returning();

  const row = updated[0];
  if (!row) return notFound();
  return apiJson({ thread: toThreadDto(row) });
}

/** DELETE /api/v1/threads/:id — messages cascade via the FK. */
export async function DELETE(context: APIContext): Promise<Response> {
  const user = await requireAuth(context);
  if (user instanceof Response) return user;
  const id = context.params.id;
  if (!id) return notFound();

  const db = getDb(context);
  const deleted = await db
    .delete(thread)
    .where(and(eq(thread.id, id), eq(thread.userId, user.id)))
    .returning({ id: thread.id });

  if (deleted.length === 0) return notFound();
  return apiJson({ ok: true });
}
