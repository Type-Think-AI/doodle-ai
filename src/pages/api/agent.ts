import type { APIContext } from "astro";
import { z } from "zod";
import { bridgeCloudflareEnv } from "../../lib/env-bridge";
import { recommendDoodleMode } from "../../lib/doodle-mode-recommender";

export const prerender = false;

const recommendationSchema = z.object({
  mode: z.enum(["normal", "collage", "full-body"]),
  reason: z.string(),
});

/**
 * POST /api/agent
 *
 * Accepts JSON: { "message": string }
 * Returns JSON: { "mode": "normal" | "collage" | "full-body", "reason": string }
 *
 * Tries the real Mastra `doodleAgent` (OpenRouter model, see
 * src/mastra/agents/doodle-agent.ts) first. That needs OPENROUTER_API_KEY
 * set (.dev.vars locally) and currently only runs reliably in local Node
 * dev — see README.md's Cloudflare/Mastra note. Any failure there (missing
 * key, model error, the Cloudflare Worker limitation) falls back to the
 * local rule-based recommender so the endpoint never hard-fails.
 */
export async function POST(context: APIContext) {
  let message: string | undefined;
  try {
    const body = await context.request.json().catch(() => ({}));
    message = (body as { message?: string }).message;
  } catch {
    return json({ error: "Invalid agent request" }, 400);
  }
  if (!message || typeof message !== "string" || !message.trim()) {
    return json({ error: "A message is required" }, 400);
  }

  await bridgeCloudflareEnv(context, ["OPENROUTER_API_KEY", "OPENROUTER_MODEL"]);
  try {
    const { mastra } = await import("../../mastra");
    const agent = mastra.getAgent("doodleAgent");
    const result = await agent.generate(
      `Decide which doodle generation mode best fits this request and give one brief reason:\n\n"${message}"`,
      { structuredOutput: { schema: recommendationSchema } },
    );
    return json(result.object);
  } catch {
    // No OPENROUTER_API_KEY, model/network error, or the Cloudflare Worker
    // build not supporting @mastra/core yet — fall back to local rules.
    return json(recommendDoodleMode(message));
  }
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
