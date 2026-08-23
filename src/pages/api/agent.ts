import type { APIContext } from "astro";
import { recommendDoodleMode } from "../../lib/doodle-mode-recommender";

export const prerender = false;

/**
 * POST /api/agent
 *
 * Accepts JSON: { "message": string }
 * Returns JSON: { "mode": "normal" | "collage" | "full-body", "reason": string }
 * from the local DoodleBooth skills layer. This endpoint deliberately has no
 * model-provider dependency, so local testing works without an API key.
 */
export async function POST(context: APIContext) {
  try {
    const body = await context.request.json().catch(() => ({}));
    const { message } = body as { message?: string };

    if (!message || typeof message !== "string" || !message.trim()) {
      return json({ error: "A message is required" }, 400);
    }

    return json(recommendDoodleMode(message));
  } catch {
    return json({ error: "Invalid agent request" }, 400);
  }
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
