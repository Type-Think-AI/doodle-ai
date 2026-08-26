import type { APIContext } from "astro";
import { apiError, apiJson, requireAuth } from "../../../lib/auth/guards";
import { getDb } from "../../../db/client";
import { feedback } from "../../../db/schema";
import { newId, optStr, readJson } from "../../../lib/api/body";

export const prerender = false;

/** Short enough for a sticky note — anything longer belongs in a document. */
const MAX_TEXT_LENGTH = 500;

/** The room id the roadmap board is currently using. */
const ROADMAP_ROOM = "public-v6";

/**
 * POST /api/v1/feedback — store feedback AND drop a sticky note on the roadmap.
 *
 * Two writes:
 *  1. D1 row — durable record, admin triage, author identity.
 *  2. Durable Object RPC (best-effort) — creates a tldraw note shape in the
 *     ICE BOX column so it's immediately visible on /roadmap. Failure here does
 *     not fail the request: the D1 row is the source of truth, the board shape
 *     is a projection. In local dev (pnpm dev:local) the binding doesn't exist
 *     and this step is silently skipped.
 *
 * Why `updateStore`? It bypasses `authorizeRecord`, which is exactly what we
 * want: the server writes the note on behalf of the user, and no user is
 * allowed to write ICE BOX furniture directly (they'd need to be an admin).
 */
export async function POST(context: APIContext): Promise<Response> {
  const result = await requireAuth(context);
  if (result instanceof Response) return result;

  const body = await readJson(context.request);
  const text = optStr(body?.text);
  if (!text) return apiError("invalid_request", "Feedback text is required.", 400);
  if (text.length > MAX_TEXT_LENGTH) {
    return apiError("invalid_request", `Feedback must be ${MAX_TEXT_LENGTH} characters or fewer.`, 400);
  }

  // 1. D1 row (always)
  const db = getDb(context);
  const feedbackId = newId();
  await db.insert(feedback).values({
    id: feedbackId,
    userId: result.id,
    text,
    createdAt: new Date(),
  });

  // 2. Roadmap sticky (best-effort)
  const env = (context.locals as { runtime?: { env?: Env } })?.runtime?.env;
  if (env?.ROADMAP_ROOM) {
    try {
      const stub = env.ROADMAP_ROOM.get(env.ROADMAP_ROOM.idFromName(ROADMAP_ROOM));
      await stub.addFeedbackNote(text, result.name ?? result.email ?? "Anonymous");
    } catch {
      // Non-fatal: D1 is the source of truth.
    }
  }

  return apiJson({ ok: true });
}
