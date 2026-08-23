import type { APIContext } from "astro";
import { RequestContext } from "@mastra/core/request-context";
import { mastra } from "../../mastra";
import { bridgeCloudflareEnv } from "../../lib/env-bridge";

export const prerender = false;

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

type StreamEvent =
  | { type: "text"; text: string }
  | { type: "image"; url: string }
  | { type: "done" }
  | { type: "error"; message: string };

/**
 * POST /api/chat
 *
 * Accepts JSON: { messages: {role, content}[], apiKey?: string }
 * Streams newline-delimited JSON events as the agent generates its reply:
 *   {"type":"text","text":"..."}   — one per text-delta chunk, append to build up the reply
 *   {"type":"image","url":"..."}   — once per doodle the generateDoodle tool produced
 *   {"type":"done"}                — stream finished successfully
 *   {"type":"error","message":".."} — stream failed; message is safe to show as-is
 *
 * Runs the full conversation through the real doodleAgent (skills + the
 * generateDoodle tool — see src/mastra/) via Agent.stream() rather than
 * .generate(), so the UI can render the reply as it's produced instead of
 * waiting for the whole thing. The PicX key is threaded through per-request
 * via RequestContext rather than stored server-side, matching every other
 * endpoint in this app (BYOK, nothing persisted server-side). There's no
 * non-agent fallback here (unlike /api/agent) — chat has no meaning without
 * the agent, so a failure just emits an {type:"error"} event the UI shows
 * as a system message.
 */
export async function POST(context: APIContext) {
  let messages: ChatMessage[];
  let apiKey: string | undefined;
  let styleId: string | undefined;
  try {
    const body = await context.request.json().catch(() => ({}));
    const parsed = body as { messages?: unknown; apiKey?: string; styleId?: string };
    if (!Array.isArray(parsed.messages) || parsed.messages.length === 0) {
      return json({ error: "messages is required" }, 400);
    }
    messages = parsed.messages as ChatMessage[];
    apiKey = parsed.apiKey;
    styleId = parsed.styleId;
  } catch {
    return json({ error: "Invalid chat request" }, 400);
  }

  bridgeCloudflareEnv(context, ["OPENROUTER_API_KEY"]);
  const agent = mastra.getAgent("doodleAgent");
  const requestContext = new RequestContext<{ apiKey?: string; styleId?: string }>([
    ["apiKey", apiKey],
    ["styleId", styleId],
  ]);

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: StreamEvent): void => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      try {
        // Cast: `messages` is a plain {role, content} array (validated above),
        // which is a valid CoreMessage shape at runtime — TS's MessageListInput
        // union just doesn't distribute discriminated-union narrowing over it.
        const agentStream = await agent.stream(messages as never, { requestContext });
        // `fullStream` is a ReadableStream<ChunkType>; read it directly rather
        // than `for await`-ing the MastraModelOutput object itself, since its
        // TS type doesn't declare Symbol.asyncIterator even though some docs
        // examples iterate it directly.
        const reader = agentStream.fullStream.getReader();
        for (;;) {
          const { done, value: chunk } = await reader.read();
          if (done) break;
          if (chunk.type === "text-delta") {
            const text = (chunk.payload as { text?: string })?.text;
            if (text) emit({ type: "text", text });
          } else if (chunk.type === "tool-result") {
            const payload = chunk.payload as { toolName?: string; result?: unknown };
            if (payload.toolName !== "generateDoodle" && payload.toolName !== "generate-doodle") continue;
            const value = payload.result as { status?: string; url?: string } | undefined;
            if (value?.status === "ok" && value.url) emit({ type: "image", url: value.url });
          } else if (chunk.type === "error") {
            const payload = chunk.payload as { error?: unknown };
            throw payload.error instanceof Error ? payload.error : new Error("Agent stream error");
          }
        }
        emit({ type: "done" });
      } catch (err) {
        // Log the real error (env var names, model ids, stack traces) server-side
        // only — never in the stream, which end users can see directly.
        console.error("POST /api/chat failed:", err);
        const message =
          err instanceof Error && /api key/i.test(err.message)
            ? "The assistant isn't configured yet on this server. Try again later."
            : "The assistant couldn't respond just now. Try again in a moment.";
        emit({ type: "error", message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-cache" },
  });
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
