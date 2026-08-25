import type { APIContext } from "astro";
import { and, asc, eq, gt } from "drizzle-orm";
import { getDb, withDbSession, type Db } from "../../../../../db/client";
import { message, thread } from "../../../../../db/schema/product";
import { apiError, apiJson, requireAuth } from "../../../../../lib/auth/guards";
import { intParam, newId, optStr, readJson, str, strArray, toDate } from "../../../../../lib/api/body";

export const prerender = false;

const PAGE_DEFAULT = 200;
const PAGE_MAX = 500;

interface MessageDto {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
  imageUrl?: string;
  refImageUrl?: string;
  images?: string[];
}

/**
 * Serialises to exactly the ChatMessage shape the client already stores, with
 * the optional fields omitted rather than set to null — `undefined` is what
 * the localStorage path produces, and the two must be indistinguishable.
 */
function toMessageDto(row: typeof message.$inferSelect): MessageDto {
  return {
    id: row.id,
    role: row.role === "assistant" ? "assistant" : "user",
    content: row.content,
    createdAt: row.createdAt.getTime(),
    ...(row.imageUrl ? { imageUrl: row.imageUrl } : {}),
    ...(row.refImageUrl ? { refImageUrl: row.refImageUrl } : {}),
    ...(row.images && row.images.length > 0 ? { images: row.images } : {}),
  };
}

/**
 * Resolve a thread the caller actually owns.
 *
 * Every message read and write funnels through here, so there is exactly one
 * place where thread ownership is decided rather than one per handler. The
 * `userId` predicate means a thread belonging to another user is simply not
 * found — see the 404-not-403 note in ../[id].ts.
 */
async function ownedThread(db: Db, threadId: string, userId: string): Promise<boolean> {
  const rows = await db
    .select({ id: thread.id })
    .from(thread)
    .where(and(eq(thread.id, threadId), eq(thread.userId, userId)))
    .limit(1);
  return rows.length > 0;
}

function notFound(): Response {
  return apiError("not_found", "That chat doesn't exist.", 404);
}

/**
 * GET /api/v1/threads/:id/messages — oldest first, which is render order.
 *
 * `?after=<epoch ms>` pages forward; `?limit=` caps the page. Chat histories
 * are short enough that the client asks for all of them in one call today,
 * but the cursor is here so a long thread does not have to change the API.
 */
export async function GET(context: APIContext): Promise<Response> {
  const user = await requireAuth(context);
  if (user instanceof Response) return user;
  const threadId = context.params.id;
  if (!threadId) return notFound();

  const { db, commit } = withDbSession(context);
  if (!(await ownedThread(db, threadId, user.id))) return commit(notFound());

  const url = new URL(context.request.url);
  const limit = intParam(url, "limit", PAGE_DEFAULT, PAGE_MAX);
  const after = url.searchParams.get("after");
  const afterDate = after ? new Date(Number.parseInt(after, 10)) : null;

  const rows = await db
    .select()
    .from(message)
    .where(
      afterDate && !Number.isNaN(afterDate.getTime())
        ? and(eq(message.threadId, threadId), gt(message.createdAt, afterDate))
        : eq(message.threadId, threadId),
    )
    .orderBy(asc(message.createdAt))
    .limit(limit);

  return commit(apiJson({ messages: rows.map(toMessageDto) }));
}

/**
 * POST /api/v1/threads/:id/messages — append one turn.
 *
 * Also bumps the thread's `updatedAt` and, on the first user turn, derives
 * its title — the same rule `appendMessage` applies locally, kept server-side
 * so a second device sees the same title without replaying the messages.
 */
export async function POST(context: APIContext): Promise<Response> {
  const user = await requireAuth(context);
  if (user instanceof Response) return user;
  const threadId = context.params.id;
  if (!threadId) return notFound();

  const body = await readJson(context.request);
  if (!body) return apiError("bad_request", "Expected a JSON body.", 400);

  const role = body.role === "assistant" ? "assistant" : body.role === "user" ? "user" : null;
  if (!role) return apiError("bad_request", "`role` must be 'user' or 'assistant'.", 400);
  const content = typeof body.content === "string" ? body.content : null;
  if (content === null) return apiError("bad_request", "`content` must be a string.", 400);

  const db = getDb(context);
  if (!(await ownedThread(db, threadId, user.id))) return notFound();

  const now = Date.now();
  const values = {
    id: str(body.id) ?? newId(),
    threadId,
    role,
    content,
    imageUrl: optStr(body.imageUrl),
    refImageUrl: optStr(body.refImageUrl),
    images: strArray(body.images),
    createdAt: toDate(body.createdAt, now),
  };

  // onConflictDoNothing makes a retried append idempotent when the client
  // supplied the id, instead of raising a primary-key error.
  await db.insert(message).values(values).onConflictDoNothing({ target: message.id });

  // Title is deliberately not derived from raw message content — see the
  // `thumbnailUrl`-guarded PATCH in ../[id].ts, which sets it once from the
  // skill's display name when the thread's first doodle finishes.
  await db
    .update(thread)
    .set({ updatedAt: new Date(now) })
    .where(and(eq(thread.id, threadId), eq(thread.userId, user.id)));

  return apiJson({ message: toMessageDto({ ...values, images: values.images ?? null }) }, 201);
}
