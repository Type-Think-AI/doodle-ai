import type { APIContext } from "astro";
import { RequestContext } from "@mastra/core/request-context";
import { bridgeCloudflareEnv } from "../../lib/env-bridge";
import { readSecret } from "../../lib/secrets";
import { getDb } from "../../db/client";
import { requireOrg } from "../../lib/auth/guards";
import { getBalance } from "../../lib/credits";
import {
  canvasDigestSchema,
  EMPTY_DIGEST,
  type CanvasDigest,
  type CanvasOp,
} from "../../lib/canvas/ops";

export const prerender = false;

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

type StreamEvent =
  | { type: "text"; text: string }
  | { type: "status"; phase: "drawing" | "reading-canvas" | "arranging" }
  | { type: "image"; url: string; skillId?: string }
  | { type: "credits"; balance: number; orgId?: string }
  | { type: "canvas"; ops: CanvasOp[]; label?: string }
  /* A non-fatal outcome the UI should offer an action for. `credits` means the
     generation was refused for lack of them — the agent explains it in prose,
     but prose has nothing to click, so the client pairs this with a CTA. */
  | { type: "notice"; kind: "credits" }
  | { type: "done" }
  | { type: "error"; message: string };

/**
 * POST /api/chat
 *
 * Accepts JSON: { messages: {role, content}[], styleId?: string }
 * Streams newline-delimited JSON events as the authenticated agent generates
 * its reply. Image generation always uses the server-owned PicX key and the
 * signed-in user's credit balance; no client credential is accepted.
 */
export async function POST(context: APIContext) {
  const org = await requireOrg(context, { generation: ["create"] });
  if (org instanceof Response) return org;
  const { user: authedUser, orgId } = org;

  let messages: ChatMessage[];
  let styleId: string | undefined;
  let projectId: string | undefined;
  let canvasDigest: CanvasDigest;
  try {
    const body = await context.request.json().catch(() => ({}));
    const parsed = body as { messages?: unknown; styleId?: string; projectId?: string; canvas?: unknown };
    if (!Array.isArray(parsed.messages) || parsed.messages.length === 0) {
      return json({ error: "messages is required" }, 400);
    }
    messages = parsed.messages as ChatMessage[];
    styleId = parsed.styleId;
    projectId = parsed.projectId;
    // Graceful: a malformed or missing digest degrades to empty board, never 400s.
    // The user's chat must not break because the canvas bridge lagged or errored.
    const digestResult = canvasDigestSchema.safeParse(parsed.canvas);
    canvasDigest = digestResult.success ? digestResult.data : EMPTY_DIGEST;
  } catch {
    return json({ error: "Invalid chat request" }, 400);
  }

  await bridgeCloudflareEnv(context, ["OPENROUTER_API_KEY", "OPENROUTER_MODEL"]);
  const { mastra } = await import("../../mastra");
  const agent = mastra.getAgent("doodleAgent");
  const runtimeEnv = (context.locals as { runtime?: { env?: Env } })?.runtime?.env;
  // Resolved here rather than inside the tool: PICX_API_KEY may be a Secrets
  // Store binding, and RequestContext carries plain values, not thunks.
  const platformPicxKey = await readSecret(runtimeEnv?.PICX_API_KEY, "PICX_API_KEY");

  const requestContext = new RequestContext<{
    platformPicxKey?: string;
    styleId?: string;
    userId: string;
    organizationId: string;
    projectId?: string;
    canvasDigest?: CanvasDigest;
    db: ReturnType<typeof getDb>;
    sessions?: KVNamespace;
  }>([
    ["platformPicxKey", platformPicxKey],
    ["styleId", styleId],
    ["userId", authedUser.id],
    ["organizationId", orgId],
    ["projectId", projectId],
    ["canvasDigest", canvasDigest],
    ["db", getDb(context)],
    // Same SESSIONS KV binding Better Auth uses as secondaryStorage — passed
    // through so generate-doodle.ts can rate-limit generations per user and
    // per org without a second KV namespace.
    ["sessions", runtimeEnv?.SESSIONS],
  ]);

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // Set on the doodle tool's call, read on its result — the two chunks
      // are adjacent in the same stream, so no cross-request state needed.
      let lastSkillId: string | undefined;
      // Enqueue defensively: the client aborts this request when the user
      // hits Stop, and enqueueing onto the torn-down stream throws.
      const emit = (event: StreamEvent): void => {
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          /* client disconnected — nothing left to stream to */
        }
      };
      try {
        // Cast: `messages` is a plain {role, content} array (validated above),
        // which is a valid CoreMessage shape at runtime — TS's MessageListInput
        // union just doesn't distribute discriminated-union narrowing over it.
        //
        // Retry: workerd's outbound fetch occasionally fails at the transport
        // layer with `TypeError: fetch failed` and an empty cause `{}` — a
        // transient network hiccup that resolves on retry. Two retries with
        // exponential backoff keep the UX smooth without masking real failures.
        const agentStream = await (async () => {
          const MAX_RETRIES = 2;
          for (let attempt = 0; ; attempt++) {
            try {
              return await agent.stream(messages as never, { requestContext });
            } catch (err) {
              const isTransientFetch =
                err instanceof TypeError && /fetch failed/i.test(err.message);
              if (!isTransientFetch || attempt >= MAX_RETRIES) throw err;
              // Exponential backoff: 300ms, 600ms
              await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
            }
          }
        })();
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
          } else if (chunk.type === "tool-call") {
            // `args`, not `input` — Mastra's public TypeScript types (e.g.
            // StaticToolCall) call this field `input`, but the actual chunk
            // fullStream emits at runtime names it `args` (see
            // @mastra/core/dist/stream-*.js's chunk-transform switch on
            // "tool-call": `payload: { ..., args: toolCallInput }`). Trusting
            // the .d.ts here silently produced `undefined` forever — the
            // sidebar thumbnail/title upgrade never fired because of this
            // one field name, even though generation itself worked fine
            // (generate-doodle.ts reads its own `input` parameter directly,
            // a different object, so it was never affected).
            const payload = chunk.payload as { toolName?: string; args?: { skill?: string } };
            if (isDoodleTool(payload.toolName)) {
              lastSkillId = payload.args?.skill;
              emit({ type: "status", phase: "drawing" });
            } else if (isCanvasReadTool(payload.toolName)) {
              // Canvas work used to emit nothing, so a turn spent reading and
              // rearranging the board looked identical to a stalled request.
              emit({ type: "status", phase: "reading-canvas" });
            } else if (isCanvasEditTool(payload.toolName)) {
              emit({ type: "status", phase: "arranging" });
            }
          } else if (chunk.type === "tool-result") {
            const payload = chunk.payload as { toolName?: string; result?: unknown };
            if (isCanvasEditTool(payload.toolName)) {
              // Canvas edit tool returns validated ops — forward them to the
              // client so the browser interpreter can apply them to tldraw.
              const value = payload.result as { status?: string; ops?: CanvasOp[]; label?: string } | undefined;
              if (value?.status === "ok" && value.ops?.length) {
                emit({ type: "canvas", ops: value.ops, label: value.label });
              }
            } else if (isDoodleTool(payload.toolName)) {
              const value = payload.result as { status?: string; url?: string; urls?: string[] } | undefined;
              if (value?.status === "ok" && value.url) {
                // A pack skill returns several frames from one call. The client
                // pushes each `image` event onto its list, so emitting one per
                // frame renders the whole set with no client change. `urls`
                // always contains `url` as its first entry; fall back to the
                // scalar so an older tool response still renders.
                const urls = value.urls?.length ? value.urls : [value.url];
                for (const url of urls) {
                  emit({ type: "image", url, skillId: lastSkillId });
                }
                // The tool already resolved its own db handle from this same
                // RequestContext, so re-reading the balance here is a cheap,
                // consistent way to tell the client what the spend just did —
                // no separate round trip through /api/v1/me needed.
                {
                  const db = getDb(context);
                  emit({ type: "credits", balance: await getBalance(db, orgId), orgId });
                }
              } else if (
                value?.status === "insufficient-credits" ||
                value?.status === "org-cap-reached"
              ) {
                // Keyed off the tool's real status rather than sniffing the
                // agent's wording, so rephrasing the prompt can never break it.
                emit({ type: "notice", kind: "credits" });
              }
            }
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
            : err instanceof TypeError && /fetch failed/i.test(err.message)
              ? "Couldn't reach the AI service. Check your connection and try again."
              : "The assistant couldn't respond just now. Try again in a moment.";
        emit({ type: "error", message });
      } finally {
        // The client aborts this request when the user hits Stop, which
        // errors any further enqueue/close on an already-torn-down stream —
        // that's an expected end, not a failure worth surfacing.
        try {
          controller.close();
        } catch {
          /* stream already closed by the client disconnecting */
        }
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-cache" },
  });
}

function isDoodleTool(name: string | undefined): boolean {
  return name === "generateDoodle" || name === "generate-doodle";
}

/** Matches both naming conventions for the canvas edit tool — the camelCase
 *  name used by the Mastra tool definition and the kebab-case alias. */
function isCanvasEditTool(name: string | undefined): boolean {
  return name === "editCanvas" || name === "canvas-edit";
}

/** Same dual-convention match for the canvas read tool. */
function isCanvasReadTool(name: string | undefined): boolean {
  return name === "readCanvas" || name === "canvas-read";
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
