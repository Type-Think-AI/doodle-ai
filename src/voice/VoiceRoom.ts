/**
 * VoiceRoom — the real-time voice mode for Doodle AI.
 *
 * This is the THIRD Durable Object in the project, after RoadmapRoom and
 * BoardRoom (both re-exported from src-worker/entry.ts). Where those two are
 * tldraw sync servers over raw `DurableObject`, VoiceRoom is a full voice
 * pipeline built on the Cloudflare `agents` SDK: `withVoice(Agent)` gives it
 * a listen → think → speak loop over a single browser WebSocket, one DO
 * instance per call session.
 *
 * The split of responsibility:
 *   - EARS: WorkersAIFluxSTT (keyless, via the AI binding) transcribes the
 *     caller's speech and fires our `onTurn` hook once a turn completes.
 *   - BRAIN: the existing Mastra `doodleAgent` runs inside `onTurn` — the
 *     SAME agent, tools (generateDoodle / generateVideo / readCanvas /
 *     editCanvas) and RequestContext shape the HTTP path in
 *     src/pages/api/chat.ts uses. Voice is an orchestration shell over the
 *     text agent, not a second brain.
 *   - MOUTH: WorkersAITTS (keyless, via the AI binding) speaks the agent's
 *     text reply. We yield text deltas as they arrive so TTS can begin
 *     speaking before the full reply is generated.
 *
 * Media (images/videos/canvas ops) is NOT spoken — it is pushed to the
 * browser over the same WebSocket as JSON via `connection.send(...)`, using
 * the exact event objects chat.ts emits. The existing tldraw island already
 * knows how to paint image/video/media/canvas events, so the canvas fills
 * live while the agent is still talking.
 */
import { Agent } from "agents";
import { withVoice, WorkersAIFluxSTT, WorkersAITTS, type VoiceTurnContext } from "@cloudflare/voice";
import type { Connection, ConnectionContext } from "agents";
import { RequestContext } from "@mastra/core/request-context";
import { verifyVoiceToken } from "../lib/voice/token";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../db/schema";
import { readSecret } from "../lib/secrets";
import {
  EMPTY_DIGEST,
  type CanvasDigest,
  type CanvasOp,
} from "../lib/canvas/ops";
import { VIDEO_ESTIMATED_SECONDS } from "../lib/video/constants";

/**
 * The same stream-event union the HTTP path emits (src/pages/api/chat.ts).
 * In voice mode these ride the WebSocket as JSON rather than an NDJSON HTTP
 * body; the browser receives them as `custommessage`. Kept in sync by shape,
 * not imported, because chat.ts declares the type inline and non-exported.
 */
type StreamEvent =
  | { type: "text"; text: string }
  | { type: "status"; phase: "drawing" | "reading-canvas" | "arranging" | "filming"; skillId?: string }
  | { type: "image"; url: string; skillId?: string }
  | { type: "video"; jobId: string; estimatedSeconds: number; skillId?: string }
  | { type: "media"; jobId: string; frames: number; skillId?: string }
  | { type: "canvas"; ops: CanvasOp[]; label?: string }
  | { type: "notice"; kind: "credits" }
  | { type: "done" }
  | { type: "error"; message: string };

const VoiceAgent = withVoice(Agent);

/** The agent's spoken name. Mirrors AGENT_NAME in components/app/voice/VoiceHud.tsx —
 *  the greeting is heard and read, so the two must say the same thing. */
const VOICE_AGENT_NAME = "Elsa";

/**
 * Per-connection identity, set by onConnect from the verified capability token
 * and read by beforeCallStart/onTurn. `connection.state` survives hibernation,
 * so a resumed socket keeps its authenticated identity.
 */
interface VoiceConnState {
  uid: string;
  oid: string;
}

/** RequestContext value shape — mirrors src/pages/api/chat.ts exactly. */
interface DoodleRequestContext {
  platformPicxKey?: string;
  styleId?: string;
  familyId?: string;
  userId: string;
  organizationId: string;
  projectId?: string;
  canvasDigest?: CanvasDigest;
  db: ReturnType<typeof drizzle<typeof schema>>;
  sessions?: KVNamespace;
  publicOrigin?: string;
}

export class VoiceRoom extends VoiceAgent<Env> {
  // Field initializers run after super(), so `this.env` is populated here.
  transcriber = new WorkersAIFluxSTT(this.env.AI);
  tts = new WorkersAITTS(this.env.AI);

  /**
   * Verify the capability token as the socket connects, and stash the resolved
   * identity on the connection so beforeCallStart/onTurn can trust it.
   *
   * The browser gets the token from POST /api/voice/token (which resolves the
   * Better Auth session with requireOrg) and passes it as `?token=` on the
   * socket URL. Here — the one place we have the upgrade request — we verify it
   * and record {uid, oid} on connection state. An unauthenticated or tampered
   * socket carries no valid claims, so beforeCallStart refuses the call.
   */
  override async onConnect(connection: Connection, ctx: ConnectionContext): Promise<void> {
    try {
      const url = new URL(ctx.request.url);
      const claims = await verifyVoiceToken(this.env, url.searchParams.get("token"));
      if (claims) {
        connection.setState({ uid: claims.uid, oid: claims.oid } satisfies VoiceConnState);
      }
    } catch {
      /* leave state unset — beforeCallStart will reject */
    }
    // Preserve the mixin/base connect behaviour (transcriber wiring, etc.).
    await super.onConnect?.(connection, ctx);
  }

  /**
   * Auth + single-speaker gate. Rejects the call unless onConnect recorded a
   * valid {uid, oid} from the capability token, and refuses a second concurrent
   * speaker so one call can never spend another user's credits.
   */
  override async beforeCallStart(connection: Connection): Promise<boolean> {
    const state = connection.state as VoiceConnState | null | undefined;
    if (!state?.uid || !state?.oid) return false; // no valid token → no call
    if (this.#speakerId !== null && this.#speakerId !== connection.id) return false;
    this.#speakerId = connection.id;
    return true;
  }

  /**
   * The agent speaks first.
   *
   * A voice surface that waits silently for the user to guess what to say is the
   * single biggest reason people bounce off voice UIs. Greeting by name the
   * moment the line opens establishes who is on the other end, proves the audio
   * path works end to end (the user HEARS it), and hands over the turn
   * explicitly. Kept to one short sentence — the screen shows the same words.
   */
  override async onCallStart(connection: Connection): Promise<void> {
    try {
      await this.speak(connection, `Hey, I'm ${VOICE_AGENT_NAME}. Tell me what to doodle.`);
    } catch {
      /* Greeting is a courtesy, never a gate — a failed hello must not kill the
         call; the user can still talk and the on-screen greeting still shows. */
    }
  }

  override onCallEnd(connection: Connection): void {
    if (this.#speakerId === connection.id) this.#speakerId = null;
  }

  /** The single active speaker's connection id, or null when idle. */
  #speakerId: string | null = null;

  /**
   * One conversational turn: transcript in, spoken text out, media pushed to
   * the canvas as a side effect.
   *
   * Returns an async generator of text chunks so the voice pipeline can hand
   * them to TTS incrementally — the agent's prose is spoken as it streams,
   * while tool results (images/videos/canvas ops) are sent to the browser out
   * of band so they never get read aloud.
   */
  override async onTurn(
    transcript: string,
    context: VoiceTurnContext,
  ): Promise<AsyncGenerator<string>> {
    const env = this.env;

    // PICX_API_KEY may be a Secrets Store binding or a plain string; resolve
    // it to a value here, exactly as chat.ts does, because RequestContext
    // carries plain values, not thunks.
    const platformPicxKey = await readSecret(env.PICX_API_KEY, "PICX_API_KEY");

    // Identity resolved from the verified capability token in onConnect and
    // stashed on connection state. beforeCallStart already refused the call if
    // these were absent, so a running turn always has a real authenticated
    // user and org whose credits the generation spends.
    const state = context.connection.state as VoiceConnState | null | undefined;
    const userId = state?.uid;
    const organizationId = state?.oid;
    if (!userId || !organizationId) {
      // Defensive: should be unreachable (beforeCallStart gates it), but never
      // run a credit-spending turn without a resolved identity. Send inline —
      // the `send` closure below is declared after this guard.
      try {
        context.connection.send(
          JSON.stringify({ type: "error", message: "Your session expired. Tap Talk to reconnect." }),
        );
      } catch {
        /* connection already closed */
      }
      return (async function* () {})();
    }

    const requestContext = new RequestContext<DoodleRequestContext>([
      ["platformPicxKey", platformPicxKey],
      ["styleId", undefined],
      ["familyId", undefined],
      ["userId", userId],
      ["organizationId", organizationId],
      ["projectId", undefined],
      // Voice has no live canvas digest bridged yet; degrade to empty board,
      // matching chat.ts's graceful fallback.
      ["canvasDigest", EMPTY_DIGEST],
      // In a DO the D1 handle comes straight off env (same as
      // src-worker/entry.ts), not the Astro APIContext helper.
      ["db", drizzle(env.DB, { schema })],
      ["sessions", env.SESSIONS],
      // No incoming HTTP request in a DO turn to derive an origin from; a
      // configured callback origin is required for video delivery. Video
      // generation refuses to spend when this is not a public https origin,
      // which is the honest behaviour for the spike until it is wired.
      ["publicOrigin", (await readSecret(env.PICX_CALLBACK_ORIGIN, "PICX_CALLBACK_ORIGIN"))?.trim() || undefined],
    ]);

    // Push a JSON event to the browser over the voice WebSocket. Defensive:
    // the socket may have torn down mid-turn (caller hung up).
    const send = (event: StreamEvent): void => {
      try {
        context.connection.send(JSON.stringify(event));
      } catch {
        /* connection closed — nothing left to stream to */
      }
    };

    const { mastra } = await import("../mastra");
    const agent = mastra.getAgent("doodleAgent");

    // The prior turns plus this transcript. VoiceTurnContext.messages already
    // holds completed history; append the current user utterance.
    const messages = [
      ...context.messages.map((m) => ({ role: m.role, content: m.content })),
      { role: "user" as const, content: transcript },
    ];

    // Return a generator so TTS speaks text deltas as they stream. All media
    // side effects are sent to the browser inside the loop.
    async function* speakStream(): AsyncGenerator<string> {
      // Set on a tool-call, read on its result — adjacent chunks in one stream.
      let lastSkillId: string | undefined;

      const agentStream = await agent.stream(messages as never, {
        requestContext,
        abortSignal: context.signal,
      });

      const reader = agentStream.fullStream.getReader();
      for (;;) {
        const { done, value: chunk } = await reader.read();
        if (done) break;

        if (chunk.type === "text-delta") {
          const text = (chunk.payload as { text?: string })?.text;
          if (text) {
            // Speak it (yielded to TTS) AND mirror it to the transcript panel.
            send({ type: "text", text });
            yield text;
          }
        } else if (chunk.type === "tool-call") {
          const payload = chunk.payload as { toolName?: string; args?: { skill?: string } };
          if (isDoodleTool(payload.toolName)) {
            lastSkillId = payload.args?.skill;
            send({ type: "status", phase: "drawing", skillId: lastSkillId });
          } else if (isVideoTool(payload.toolName)) {
            lastSkillId = payload.args?.skill;
            send({ type: "status", phase: "filming" });
          } else if (isCanvasReadTool(payload.toolName)) {
            send({ type: "status", phase: "reading-canvas" });
          } else if (isCanvasEditTool(payload.toolName)) {
            send({ type: "status", phase: "arranging" });
          }
        } else if (chunk.type === "tool-result") {
          const payload = chunk.payload as { toolName?: string; result?: unknown };
          if (isCanvasEditTool(payload.toolName)) {
            const value = payload.result as
              | { status?: string; ops?: CanvasOp[]; label?: string }
              | undefined;
            if (value?.status === "ok" && value.ops?.length) {
              send({ type: "canvas", ops: value.ops, label: value.label });
            }
          } else if (isDoodleTool(payload.toolName)) {
            const value = payload.result as
              | { status?: string; url?: string; urls?: string[]; jobId?: string; frames?: number }
              | undefined;
            if (value?.status === "queued" && value.jobId) {
              send({ type: "media", jobId: value.jobId, frames: value.frames ?? 1, skillId: lastSkillId });
            } else if (value?.status === "ok" && value.url) {
              const urls = value.urls?.length ? value.urls : [value.url];
              for (const url of urls) send({ type: "image", url, skillId: lastSkillId });
            } else if (
              value?.status === "insufficient-credits" ||
              value?.status === "org-cap-reached"
            ) {
              send({ type: "notice", kind: "credits" });
            }
          } else if (isVideoTool(payload.toolName)) {
            const value = payload.result as
              | { status?: string; jobId?: string; estimatedSeconds?: number }
              | undefined;
            if (value?.status === "queued" && value.jobId) {
              send({
                type: "video",
                jobId: value.jobId,
                estimatedSeconds: value.estimatedSeconds ?? VIDEO_ESTIMATED_SECONDS,
                skillId: lastSkillId,
              });
            } else if (
              value?.status === "insufficient-credits" ||
              value?.status === "org-cap-reached"
            ) {
              send({ type: "notice", kind: "credits" });
            }
          }
        } else if (chunk.type === "error") {
          const payload = chunk.payload as { error?: unknown };
          send({ type: "error", message: "The assistant couldn't respond just now." });
          throw payload.error instanceof Error ? payload.error : new Error("Agent stream error");
        }
      }

      send({ type: "done" });
    }

    return speakStream();
  }
}

/* Tool-name matchers — dual naming convention, identical to chat.ts. */
function isDoodleTool(name: string | undefined): boolean {
  return name === "generateDoodle" || name === "generate-doodle";
}
function isVideoTool(name: string | undefined): boolean {
  return name === "generateVideo" || name === "generate-video";
}
function isCanvasEditTool(name: string | undefined): boolean {
  return name === "editCanvas" || name === "canvas-edit";
}
function isCanvasReadTool(name: string | undefined): boolean {
  return name === "readCanvas" || name === "canvas-read";
}
