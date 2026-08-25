import type { APIContext } from "astro";
import { apiError, apiJson, requireAuth } from "../../../lib/auth/guards";
import { getDb } from "../../../db/client";
import { feedback } from "../../../db/schema";
import { newId, optStr, readJson } from "../../../lib/api/body";

export const prerender = false;

/** Plenty for a feedback textarea; guards against someone pasting a whole document. */
const MAX_TEXT_LENGTH = 4000;

/**
 * POST /api/v1/feedback — store one freeform note from the feedback dialog.
 *
 * No credit reward for submitting (deliberate — see FeedbackDialog.astro),
 * and no rate limit: this is authenticated-only and low stakes.
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

  const db = getDb(context);
  await db.insert(feedback).values({
    id: newId(),
    userId: result.id,
    text,
    createdAt: new Date(),
  });

  return apiJson({ ok: true });
}
