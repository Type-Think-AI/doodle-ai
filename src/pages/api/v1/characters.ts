import type { APIContext } from "astro";
import { and, desc, eq } from "drizzle-orm";
import { getDb, withDbSession } from "../../../db/client";
import { character } from "../../../db/schema/product";
import { apiError, apiJson, requireAuth } from "../../../lib/auth/guards";
import { intParam, newId, optStr, readJson, str, toDate } from "../../../lib/api/body";

export const prerender = false;

const PAGE_DEFAULT = 500;
const PAGE_MAX = 1000;

export interface CharacterDto {
  id: string;
  name: string;
  imageUrl: string;
  createdAt: number;
}

function toDto(row: typeof character.$inferSelect): CharacterDto {
  return { id: row.id, name: row.name, imageUrl: row.imageUrl, createdAt: row.createdAt.getTime() };
}

/** GET /api/v1/characters — newest first, matching listCharacters()'s sort. */
export async function GET(context: APIContext): Promise<Response> {
  const user = await requireAuth(context);
  if (user instanceof Response) return user;

  const limit = intParam(new URL(context.request.url), "limit", PAGE_DEFAULT, PAGE_MAX);
  const { db, commit } = withDbSession(context);
  const rows = await db
    .select()
    .from(character)
    .where(eq(character.userId, user.id))
    .orderBy(desc(character.createdAt))
    .limit(limit);

  return commit(apiJson({ characters: rows.map(toDto) }));
}

/** POST /api/v1/characters — create. */
export async function POST(context: APIContext): Promise<Response> {
  const user = await requireAuth(context);
  if (user instanceof Response) return user;

  const body = await readJson(context.request);
  const imageUrl = body ? str(body.imageUrl) : null;
  if (!imageUrl) return apiError("bad_request", "`imageUrl` is required.", 400);

  const values = {
    id: optStr(body?.id) ?? newId(),
    userId: user.id,
    name: optStr(body?.name) ?? "Unnamed",
    imageUrl,
    createdAt: toDate(body?.createdAt, Date.now()),
  };

  const db = getDb(context);
  await db.insert(character).values(values).onConflictDoNothing({ target: character.id });

  return apiJson({ character: toDto(values) }, 201);
}

/** PATCH /api/v1/characters — rename. `id` travels in the body, not the path. */
export async function PATCH(context: APIContext): Promise<Response> {
  const user = await requireAuth(context);
  if (user instanceof Response) return user;

  const body = await readJson(context.request);
  const id = body ? str(body.id) : null;
  if (!id) return apiError("bad_request", "`id` is required.", 400);
  const name = optStr(body?.name);
  if (!name) return apiError("bad_request", "`name` is required.", 400);

  const db = getDb(context);
  // Ownership is enforced by the predicate rather than a read-then-write, so
  // there is no window in which the row could change hands between the two.
  const updated = await db
    .update(character)
    .set({ name })
    .where(and(eq(character.id, id), eq(character.userId, user.id)))
    .returning();

  const row = updated[0];
  if (!row) return apiError("not_found", "That character doesn't exist.", 404);
  return apiJson({ character: toDto(row) });
}

/** DELETE /api/v1/characters?id=… */
export async function DELETE(context: APIContext): Promise<Response> {
  const user = await requireAuth(context);
  if (user instanceof Response) return user;

  const url = new URL(context.request.url);
  const id = url.searchParams.get("id") ?? (await readJson(context.request).then((b) => (b ? str(b.id) : null)));
  if (!id) return apiError("bad_request", "`id` is required.", 400);

  const db = getDb(context);
  const deleted = await db
    .delete(character)
    .where(and(eq(character.id, id), eq(character.userId, user.id)))
    .returning({ id: character.id });

  if (deleted.length === 0) return apiError("not_found", "That character doesn't exist.", 404);
  return apiJson({ ok: true });
}
