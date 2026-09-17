# Talk mode — fal.ai Grok Voice realtime + our MCP

**Status:** proposed, with Ajay / founder locks recorded below. **Docs only
— do not implement from this PR.**
**Supersedes:** [voice-mode-plan.md](./voice-mode-plan.md) (Cloudflare
`@cloudflare/voice` Flux STT → Mastra → Aura TTS).
**Companion:** [mcp-doodle-tools.md](./mcp-doodle-tools.md) (tool schemas +
auth headers).
**Closed PR:** [#6](https://github.com/Type-Think-AI/doodle-ai/pull/6)
(promote Cloudflare voice to `main`) — superseded by this direction.
**Base:** `dev` after merged [#5](https://github.com/Type-Think-AI/doodle-ai/pull/5)
(main reconciled into `dev`).

Pinned vendor facts (not training data):

- fal realtime JWT + `tokenProvider`:
  [fal real-time docs](https://fal.ai/docs/documentation/model-apis/inference/real-time)
- fal JS client:
  [realtime API](https://fal.ai/docs/api-reference/client-libraries/javascript/realtime)
- fal app: [`xai/grok-voice/realtime`](https://fal.ai/models/xai/grok-voice/realtime)
- xAI Speech-to-Speech (session.update, MCP tools, VAD, resumption):
  [docs.x.ai speech-to-speech](https://docs.x.ai/developers/model-capabilities/audio/speech-to-speech)
- xAI limits: max session **120 minutes**; ephemeral client-secret
  `expires_after.seconds` max **3600**; history dropped after **30 minutes**
  idle if resumption is on
- Cloudflare MCP: prefer `createMcpHandler` (stateless Streamable HTTP);
  `McpAgent` is deprecated. Pin MCP SDK ≥ 1.26.0 (CVE-2026-25536)

---

## 0. Decision, stated plainly

**Talk mode is true speech-to-speech Grok Voice on fal.** The browser streams
mic audio to fal `xai/grok-voice/realtime`. Grok speaks audio back on the same
socket. Doodle product tools are **not** Mastra-in-the-voice-loop and **not**
fal's coding MCP (`mcp.fal.ai`). Grok calls **our** HTTPS MCP
(`https://doodleai.art/mcp`) through `session.tools` (`type: "mcp"`). v1 tools
wrap the existing `generateDoodle` / `readCanvas` / `editCanvas` execute paths,
with the same Better Auth org gate, org-owned credits, KV rate limits, and
PicX platform key. `generateVideo` stays documented as Phase 5 /
internal-only wire-up — it is **not** in default `session.update`
`allowed_tools` and is not day-one discoverable.

**Chat mode does not move.** `POST /api/chat` keeps Mastra `doodleAgent` and
the NDJSON `StreamEvent` stream.

**The Cloudflare Talk path on `dev` is a dead end for feel.** It is
implemented (not merely planned): `VoiceRoom` transcribes with Workers AI
Flux, runs `doodleAgent.stream()`, then speaks Aura TTS. That is STT → text
agent → TTS. It is rejected as feeling dead. Keep the **UI shell** and the
**canvas event contract**; replace the audio brain and the tool transport.

Locked product constraints:

- Live: `doodleai.art`. Staging: `dev.doodleai.art`.
- Stack stays: Astro 7, Cloudflare Workers, D1, KV, Durable Objects, Mastra
  (chat only), PicX, Better Auth (Google).
- Never put `FAL_KEY` or an xAI key in the browser. Short-lived fal
  realtime JWT from our Worker (`tokenProvider`).
- One tldraw island. Reuse `StreamEvent` + `apply-ops.ts` when tools return
  media. Canvas `persistenceKey` is thread-scoped (`doodleai-canvas-${threadId}`
  on `/c/[id]`); Talk must bind `VoiceSession.sid` to that same `threadId`.
- `VoiceSession` is a **Durable Object** (SSE fanout + event log + digest).
  Not KV. New wrangler sqlite class / binding if needed; never delete
  `VoiceRoom` migration history.
- Do not claim paid plans or video as marketing-ready. Do not put
  `generateVideo` on v1 `allowed_tools`.
- Talk v1 is **single-image only**: no pack skills and no `generateVideo`
  in `session.tools` `allowed_tools`. Pack confirmation / packs are a
  later open or Phase 4+ decision.
- Consumer name stays **Elsa**. The voice brain is Grok (fal
  `xai/grok-voice/realtime`). Do not rename Elsa away. Do not say Grok
  in the HUD.
- **Shared `FAL_KEY`** for prod + staging (one fal account) unless later
  spend dashboards force a split.
- Build priority: **our doodle MCP foundation before full Talk UI**
  (ping + `generateDoodle` ahead of fal HUD polish).
- Credits: free signup grant (`SIGNUP_GRANT_CREDITS = 10` in
  `src/lib/credits/costs.ts`), **1 credit per image**
  (`CREDITS_PER_IMAGE = 1`). Video remains **1 credit per second**, internal.

---

## 1. What is already on `dev` (do not invent APIs)

Investigated before writing this plan. Implementation must match these
shapes.

### 1.1 Current Talk pipeline (to be removed after Grok Talk ships)

| Piece | Path | Role |
|---|---|---|
| Voice DO | `src/voice/VoiceRoom.ts` | `withVoice(Agent)`: Flux STT, Aura TTS, `onTurn` → `mastra.getAgent("doodleAgent").stream()` |
| Entry routing | `src-worker/entry.ts` | `routeAgentRequest` for `/agents/*`; `export { VoiceRoom }` |
| Bindings | `wrangler.json` | `ai.binding: AI`; `VOICE_ROOM` → `VoiceRoom`; migration tag `v3` (`new_sqlite_classes: ["VoiceRoom"]`) — **prod and `env.staging`** |
| Packages | `package.json` | `@cloudflare/voice` `^0.4.0`, `agents` `^0.22.0` |
| Capability token | `src/lib/voice/token.ts` | HMAC-SHA256 over `BETTER_AUTH_SECRET`; claims `{ uid, oid, exp }`; TTL **120s** |
| Token route | `src/pages/api/voice/token.ts` | `requireOrg(..., { generation: ["create"] })` then `mintVoiceToken` |
| Shared context helper | `src/lib/voice/context.ts` | Builds the same `RequestContext` keys as chat. **VoiceRoom currently inlines the context and does not call this helper.** |
| HUD | `src/components/app/voice/VoiceHud.tsx` | `useVoiceAgent({ agent: "VoiceRoom", query: { token } })`; Elsa; blob; photo upload |
| Island constraint | `src/components/app/DoodleCanvas.tsx` | VoiceHud is `React.lazy` **inside** the one tldraw React graph. A second Astro React island breaks `@astrojs/cloudflare` asset relocation (ENOENT). |
| Event forwarder | `handleVoiceCanvasEvent` in `DoodleCanvas.tsx` | `image`+url / `video`+url / `canvas`+ops → `doodleai:canvas-add` / `doodleai:canvas-ops` |
| Layout | `src/pages/c/[id].astro`, `src/styles/voice-mode.css` | Chat \| Talk toggle; `data-mode="voice"` hides `.chat-page`; `?voice=1` deep link from `src/pages/index.astro` |
| Photo in Talk | VoiceHud → `POST /api/upload` → `sendText("Attached photo: <url>")` | Same prefix chat uses (`doodle-agent.ts`) |

`VoiceRoom` already documents the `StreamEvent` union (copied, not imported,
from `src/pages/api/chat.ts`). It pushes JSON on the Agents WebSocket;
`lastCustomMessage` is the HUD's side channel. Canvas digest is **not**
bridged: `onTurn` sets `canvasDigest` to `EMPTY_DIGEST`. Video
`publicOrigin` is `PICX_CALLBACK_ORIGIN` only (no request URL in a DO).

**Gap vs chat:** `handleVoiceCanvasEvent` does **not** handle `{ type:
"media", jobId }` or `{ type: "video", jobId }`. Chat does, in
`src/scripts/app/chat/api-turn.ts` (`startImageJob` + video wait card).
Images are webhook-delivered now (`generate-doodle.ts` returns `queued` +
`jobId`). Talk on `dev` will miss placeholders unless the new HUD reuses
the job watchers. That is in scope for Grok Talk, not a new invention.

### 1.2 Chat path (keep)

`POST /api/chat` (`src/pages/api/chat.ts`):

- Auth: `requireOrg` + `generation: ["create"]`
- Body: `{ messages, styleId?, familyId?, projectId?, canvas? }`
- `canvas` parsed with `canvasDigestSchema`; malformed → `EMPTY_DIGEST`
- Streams NDJSON `StreamEvent`s
- Tool-name matchers accept camelCase **and** kebab-case
- Credits refresh via `{ type: "credits", balance, orgId }` after spend

`StreamEvent` (canonical, chat.ts):

```
text | status(drawing|reading-canvas|arranging|filming) | image
| video(jobId, estimatedSeconds) | media(jobId, frames)
| credits | canvas(ops, label?) | notice(credits) | done | error
```

### 1.3 Tools and money (reuse execute, do not fork pricing)

| Tool | File | Mastra id | Charge | Rate limit (existing) |
|---|---|---|---|---|
| generate doodle | `src/mastra/tools/generate-doodle.ts` | `generate-doodle` | `creditCostForSkill` = images × 1 | 8/min user, org `generationsPerMinute` default 40 |
| generate video | `src/mastra/tools/generate-video.ts` | `generate-video` | `videoCreditCost` = 1 credit / second | 3/min user, default 12/org |
| read canvas | `src/mastra/tools/canvas-read.ts` | `readCanvas` | none | digest from context |
| edit canvas | `src/mastra/tools/canvas-edit.ts` | `editCanvas` | none | validates only; browser applies |

Credits are **org-owned** (`src/lib/credits/index.ts`). `spend` /
`refund` are idempotency-keyed. Signup grant is 10 credits. No Stripe
purchase path (roadmap Phase 5 skipped) — `notice.kind: "credits"` must
not imply a store.

`RequestContext` keys (chat + `src/lib/voice/context.ts`):
`platformPicxKey`, `styleId`, `familyId`, `userId`, `organizationId`,
`projectId`, `canvasDigest`, `db`, `sessions`, `publicOrigin`.

PicX images/videos complete via `POST /api/webhooks/picx`. Client watches
`GET /api/v1/videos/:id` (shared `generation` row).

### 1.4 What this is not

| Thing | Why it is out |
|---|---|
| fal `mcp.fal.ai` | Coding MCP for IDE assistants. Locked: not the product tool path. |
| WebMCP (`docs/webmcp.md`) | In-page browser tools. **Must never spend credits.** Different audience (Chrome origin trial). |
| Client `type: "function"` tools as the product path | xAI would send `response.function_call_arguments.done` to the browser; we would re-implement the Worker. Remote MCP is the locked path. Function tools may be a **fallback** only if fal/xAI MCP transport fails the spike (open question). |
| Second tldraw / `@tldraw/sync` island | Breaks the Cloudflare build. |
| Mastra as the Talk brain | Chat only. Grok Voice **is** the Talk brain. |
| Marketing video or paid plans | Not ready. Talk omits `generateVideo` until Phase 5; chat Mastra may still queue a clip. |

---

## 2. Architecture

Two sockets, one Worker, one canvas.

```
┌────────────────────────────────── BROWSER (Talk) ──────────────────────────────────┐
│  Chat | Talk toggle · data-mode="voice" hides chat column                          │
│                                                                                    │
│  HUD Start → POST /api/voice/session { threadId }                                  │
│              ← { sid, threadId, falJwt, mcpToken }                                 │
│  Mic ── PCM/Opus ──► fal.realtime.connect("xai/grok-voice/realtime")               │
│                      tokenProvider() → POST /api/fal/realtime-token (JWT refresh)  │
│                      session.update { voice, instructions, turn_detection, tools } │
│                      ◄── Grok audio + transcripts ── Speaker                       │
│                                                                                    │
│  GET /api/voice/session/:sid/events  (SSE StreamEvents)                            │
│       └─ handleVoiceCanvasEvent + startImageJob / video watcher                    │
│  POST /api/voice/session/:sid/canvas (digest)                                      │
│  POST /api/upload → conversation.item.create "Attached photo: <url>"               │
│                                                                                    │
│  ONE DoodleCanvas island · apply-ops.ts · doodleai:canvas-add / :canvas-ops        │
└───────────────┬───────────────────────────────────────────────┬────────────────────┘
                │ fal JWT (short)                               │ cookie session
                ▼                                               ▼
┌──────────────────────────── CLOUDFLARE WORKER (doodleai-agent) ────────────────────┐
│  POST /api/fal/realtime-token  (tokenProvider refresh path)                        │
│    requireOrg(generation:create) → rest.fal.ai/tokens/realtime                     │
│    Authorization: Key ${FAL_KEY}  body: { allowed_apps, duration: 120 }            │
│    FAL_KEY never leaves the Worker                                                 │
│                                                                                    │
│  POST /api/voice/session { threadId } → { sid, threadId, falJwt, mcpToken }         │
│  VoiceSession Durable Object (firm): uid, oid, threadId, digest, event log, closedAt │
│                                                                                    │
│  /mcp  createMcpHandler (Streaming HTTP; SSE fallback if spike requires)           │
│    verify mcpToken + X-Doodle-Session == sid                                       │
│    v1 tools → runGenerateDoodle / read / edit  (generateVideo = Phase 5)           │
│    append StreamEvent → session SSE                                                │
│                                                                                    │
│  D1 ledger · KV SESSIONS rate limits · PICX_API_KEY · PICX webhook (unchanged)     │
│  POST /api/chat  (Mastra) unchanged                                                │
└───────────┬───────────────────────────────────────────────┬────────────────────────┘
            │ JWT                                           │ Bearer mcpToken
            ▼                                               ▼
┌── fal realtime ──┐                         ┌── xAI Grok Voice (via fal) ──────────┐
│ xai/grok-voice/  │  audio ⇄ audio          │ session.tools[0]:                    │
│ realtime         │◄───────────────────────►│   type: mcp                          │
│                  │                         │   server_url: https://doodleai.art/mcp│
│                  │                         │   server_label: doodle               │
│                  │                         │   allowed_tools: [generateDoodle,    │
│                  │                         │     readCanvas, editCanvas]          │
│                  │                         │   (no generateVideo until Phase 5)   │
│                  │                         │   authorization: Bearer <mcpToken>   │
└──────────────────┘                         └──────────────┬───────────────────────┘
                                                            │ HTTPS MCP
                                                            ▼
                                                 our /mcp → PicX / canvas ops
```

**threadId ↔ VoiceSession.sid (required):** Talk is the `/c/[id]` page.
`DoodleCanvas` already scopes tldraw with
`persistenceKey` `doodleai-canvas-${threadId}` — each chat thread is
exactly one board. `VoiceSession` must store that same `threadId` and be
minted from the Talk page with it (`POST /api/voice/session` body includes
the open chat `threadId`; response echoes `{ sid, threadId, … }`). `sid`
is the session instance; `threadId` is the board. Talk doodles/ops fan out
on that session's SSE and must land on **that thread's board**, not an
orphaned session with no thread binding. Reject mint without a thread id
from `/c/[id]` (including `new` before a real id exists — create/resolve
the thread first, same as chat).

**VoiceSession is a Durable Object (firm):** SSE fanout, the StreamEvent
log, and the canvas digest live in a `VoiceSession` DO keyed by **our**
`sid`. Not KV, not “DO/KV”. Plan-level wrangler: add a `VOICE_SESSION`
binding → `VoiceSession`, and a new sqlite class migration
(`new_sqlite_classes: ["VoiceSession"]`) if it is a new class. **Never
delete `VoiceRoom` from `wrangler.json` migration history** — Cloudflare
forbids it. Stop exporting / binding the old class later; keep the
historical tags.

**Why a side channel exists:** xAI docs state MCP tools are executed
**server-side**. Tool JSON returns to Grok so it can talk about the result.
The browser never sees that payload. Canvas paint therefore cannot ride the
fal audio socket the way it rides today's VoiceRoom WebSocket. We keep the
**event schema** and move the **transport** to SSE on the VoiceSession DO.

**Why not run Mastra inside Talk:** Grok already chooses tools and speaks.
A second LLM in the loop is the dead Cloudflare feel. MCP tools are thin
wrappers around the existing execute functions.

---

## 3. UI / UX (Talk vs Chat)

Reuse the shell already on `dev`. Replace only the HUD transport and the
missing job-watch path.

### 3.1 Two modes, one canvas

Feature name (consumer): **Talk**. Chat stays Chat.

- **Chat** = today's split (thread + composer + canvas). Mastra.
- **Talk** = canvas-only (`data-mode="voice"`). Chat column and resize
  handle hidden at every width (`src/styles/voice-mode.css`). Same
  `DoodleCanvas`, same thread `persistenceKey`
  (`doodleai-canvas-${threadId}` on `/c/[id]`). The VoiceSession created
  on HUD Start is bound to that `threadId` so spoken doodles/ops hit this
  board.

Toggle already lives top-left of the stage in `src/pages/c/[id].astro`.
Composer Talk button (`ComposerToolbar.astro`) and home
`/c/new?voice=1` stay. Entering Talk must **not** request the mic; the
HUD Start control does (today's "ONE microphone prompt" rule).

This is **not** the chat page with a mic. No message bubbles in Talk.
Optional faint caption in the HUD, off by default.

### 3.2 HUD states

**Elsa stays.** Founder lock: Elsa is the consumer UX / spoken name
(today `AGENT_NAME = "Elsa"` in VoiceHud **and** `VOICE_AGENT_NAME` in
VoiceRoom — they stay in sync). The voice **brain** is Grok on fal
`xai/grok-voice/realtime`. Do **not** rename Elsa away. Greeting stays
one short sentence, heard **and** shown: *Hey, I'm Elsa. Tell me what
to doodle.*

Map Grok/fal events onto consumer states. Never say WebSocket, STT, TTS,
JWT, MCP, fal, Grok, model, PCM, latency. The user talks to Elsa.

| HUD | User copy | Driver |
|---|---|---|
| Idle | Talk to Elsa / Start talking | no session |
| Connecting | Getting Elsa… | mint tokens + fal connect + first `session.update` |
| Listening | listening… | VAD idle / user speaking (`input_audio_*`) |
| Thinking | thinking… | response in flight, no audio yet |
| Drawing / Filming | drawing… / filming… | `status` StreamEvent from MCP |
| Talking | talking… | assistant audio playing |
| Credits | honest "out of credits" + no fake Upgrade store | `notice.kind: "credits"` |
| Failed / Denied | Try again / allow the mic | connect timeout (~12s already in HUD) or `NotAllowedError` |

Waveform: keep the warm morphing blob as the signature (already built).
Drive it from mic RMS while listening and from assistant playback envelope
while talking. `prefers-reduced-motion` → static. Optional later: a
hand-drawn scribble waveform as in the old plan §9.4 — not a blocker.

Call timer can stay. End / mute stay. "Add a photo" stays the only attach
path in Talk (composer is hidden).

### 3.3 What lands on the canvas

Same events as chat, same interpreters:

| Event | Canvas |
|---|---|
| `status: drawing` | reserve placeholder sized by `skillId` |
| `media` | `startImageJob` → each frame `doodleai:canvas-add` |
| `image` | add still (legacy sync path; still emit if a tool ever returns `ok`+url) |
| `video` | existing wait-state card keyed by `jobId` |
| `canvas` | `apply-ops.ts` in one undo step |
| `notice: credits` | HUD CTA, no Stripe lie |
| `credits` | sidebar balance (`doodleai:credits`) |

### 3.4 Consumer copy rules

Say: "Talk to your doodle", "it's listening", "watch it come to life while
you speak". Status words: *Listening… · Thinking… · Drawing… · Talking…*

Do not say: video is a product pillar, Pro/paid, "powered by Grok/fal",
or anything that implies a checkout.

---

## 4. MCP (our server)

Full schemas: [mcp-doodle-tools.md](./mcp-doodle-tools.md).

### 4.1 Tools

v1 `allowed_tools` (default `session.update`, Phases 2–4): `generateDoodle`,
`readCanvas`, `editCanvas`.

Talk v1 `generateDoodle` is **single-image only**. Pack skills (`moods`,
`seasonal`, `expressions`, `style-roll`, `childhood`, `festival`,
`webtoon` in `GENERATION_MODES`) are out: reject them in the MCP handler
and omit them from Talk instructions. Pack confirmation / enabling packs
is a later open or Phase 4+ decision — not a v1 requirement.

`generateVideo` is **not** in `allowed_tools`. Keep the schema documented
as Phase 5 / internal-only wire-up — not day-one discoverable. The hard
gate is **omitting it from `allowed_tools`** (and from the minted token
`scp`) until Phase 5. Documenting the tool is not enough if Grok can
still see it.

Implementation rule: **extract** the Mastra `execute` bodies into
`src/lib/tools/run-*.ts` (or equivalent) callable from both Mastra
`createTool` and the MCP handler. Do not copy-paste spend/refund/PicX
submit. Chat must keep working on the same functions. Chat may still call
`generate-video` via Mastra; Talk must not advertise it until Phase 5.

### 4.2 Auth and session binding

1. Browser is signed in (Better Auth cookie or bearer — `requireOrg`) on
   `/c/[id]`. The open chat `threadId` is the route param (same value
   handed to `DoodleCanvas`).
2. HUD Start → `POST /api/voice/session` with `{ threadId }`. Worker
   creates the VoiceSession Durable Object, **stores `threadId` on the
   session**, and returns `{ sid, threadId, falJwt, mcpToken }`.
3. Browser connects fal with the minted `falJwt`. `tokenProvider`
   refreshes via `POST /api/fal/realtime-token` (not the session mint).
4. Browser sends `session.update` with
   `tools: [{ type: "mcp", server_url, server_label: "doodle",
   allowed_tools, authorization: "Bearer " + mcpToken,
   headers: { "X-Doodle-Session": sid } }]`.
   v1 `allowed_tools` = `generateDoodle`, `readCanvas`, `editCanvas`.
5. xAI/fal calls `/mcp` with those headers. We verify HMAC, expiry,
   `typ === "mcp"`, `sid` match, and that the session is open for that
   `uid`/`oid` **and still bound to the minted `threadId`**.
6. Tool runs with `RequestContext` built like `buildVoiceRequestContext`.
   Mutating tools append StreamEvents on this `sid`; the HUD on `/c/[id]`
   applies them to `persistenceKey doodleai-canvas-${threadId}`.

The MCP token **is** in the browser (it has to be, so the browser can put
it on `session.update`). That is the same trust model as today's 120s
voice token on `?token=`. Mitigations: short TTL (~5 minutes, refresh via
`session.update`), bind to `sid` + `threadId`, single-speaker session,
revoke on `endCall` / Talk exit.

Do not put Better Auth session cookies on `session.tools.headers`. xAI
would then hold a full login.

### 4.3 Allowlists and SSRF

- `server_url` is **our** origin only. Never accept a client-supplied MCP
  URL.
- Tool image URLs: `https` + host allowlist (`cdn.picxstudio.com` and
  whatever `/api/upload` already returns). No IPs, localhost, or redirects
  off-list.
- `allowed_tools` on `session.update` is a second gate; the server is the
  first.
- MCP handler must not fetch arbitrary URLs, proxy, or take
  `publicOrigin` / keys from arguments.
- CORS on `/mcp`: this endpoint is called by **xAI/fal servers**, not the
  user's browser. Do not open `Access-Control-Allow-Origin: *` with
  credentialed cookies. Browser Talk traffic uses `/api/voice/*` and
  `/api/fal/*`, cookie-authenticated.

### 4.4 Deploy

Same Worker as the site. Routes on the Astro Worker (or `entry.ts`
prefix, like `/agents/` today):

| Route | Auth | Purpose |
|---|---|---|
| `POST /api/fal/realtime-token` | `requireOrg` + generation:create | fal JWT refresh for `tokenProvider` |
| `POST /api/voice/session` | same | body `{ threadId }`; create VoiceSession DO; return `{ sid, threadId, falJwt, mcpToken }` |
| `POST /api/voice/session/:sid/canvas` | session cookie **and** sid belongs to caller | digest upsert on that thread-bound session |
| `GET /api/voice/session/:sid/events` | same | SSE StreamEvents from the VoiceSession DO |
| `POST /api/voice/session/:sid/close` | same | revoke mcp token, end session |
| `/mcp` (+ `/mcp/sse` if needed) | MCP capability token | Grok tools (v1 allowlist; no `generateVideo`) |

Staging uses `https://dev.doodleai.art/...`. `session.update` must use
the **current** origin so a staging Talk session cannot hit prod MCP
(and vice versa). Token `sid` + separate D1/KV already isolate data.

`FAL_KEY` in Secrets Store (see §7). Create the store secret **before**
adding the `wrangler.json` binding (docs/secrets.md: missing secret →
deploy error 10182, blocks later deploys).

Workers MCP: `createMcpHandler` from the Agents SDK, factory-per-request
(no shared `McpServer` singleton). Long PicX submits already return
`queued`; tool handlers should finish in seconds, not wait for webhooks.

---

## 5. Session lifecycle

### 5.1 Connect

1. User taps Start on the HUD (already signed in, or we fire
   `doodleai:open-auth` — existing VoiceHud branch). Talk is `/c/[id]`;
   the HUD already has that page's `threadId`.
2. `POST /api/voice/session` with JSON `{ threadId }` (a JSON body so
   `wrangler dev --remote` CSRF does not reject a bodyless POST — same
   lesson as today's `/api/voice/token`). Worker creates the VoiceSession
   Durable Object, stores `threadId` on it, and returns
   `{ sid, threadId, falJwt, mcpToken }`.
3. `fal.realtime.connect("xai/grok-voice/realtime", { tokenProvider,
   tokenExpirationSeconds: 120, … })`. Initial JWT may be the minted
   `falJwt`; **refresh** is always `POST /api/fal/realtime-token`.
4. On open, send `session.update` (below).
5. Grok greets (instructions say to speak first). HUD shows the same line.

`tokenProvider` is the fal JWT refresh path. Worker:

```http
POST https://rest.fal.ai/tokens/realtime
Authorization: Key <FAL_KEY>
{ "allowed_apps": ["xai/grok-voice/realtime"], "duration": 120 }
```

Only that app id is allowed. A client-supplied `app` query param is
ignored or must equal that id; never mint a token for an arbitrary fal
app.

### 5.2 `session.update` (proposed defaults)

Spike must confirm the fal wire format is the xAI event protocol (expected)
vs a fal-specific wrapper.

```json
{
  "type": "session.update",
  "session": {
    "voice": "eve",
    "instructions": "<Talk system prompt: you are Elsa (never say Grok/fal); warm, brief, single-image doodle tools only, no packs, no video; never read URLs, never claim a doodle is finished when status is queued, ask for a photo when the skill needs one, do not pitch paid plans>",
    "turn_detection": {
      "type": "server_vad",
      "silence_duration_ms": 600,
      "prefix_padding_ms": 300
    },
    "audio": {
      "input":  { "format": { "type": "audio/pcm", "rate": 24000 } },
      "output": { "format": { "type": "audio/pcm", "rate": 24000 } }
    },
    "resumption": { "enabled": true },
    "tools": [
      {
        "type": "mcp",
        "server_url": "https://doodleai.art/mcp",
        "server_label": "doodle",
        "server_description": "Doodle AI canvas and generation tools",
        "allowed_tools": ["generateDoodle", "readCanvas", "editCanvas"],
        "authorization": "Bearer <mcpToken>",
        "headers": { "X-Doodle-Session": "<sid>" }
      }
    ]
  }
}
```

Turn-detection numbers are starting points; tune on staging. Idle timeout:
set `turn_detection.idle_timeout_ms` once the spike shows the field is
honoured on fal, so a silent tab does not bill audio forever.

Instructions should be a **Talk-specific** subset of `doodle-agent.ts`
(single-image skill roster only, photo prefix, canvas rules,
queued-not-ready). Do not load the full Mastra skill-file machinery in
Voice. Do not bake pack skills into the roster. If Grok needs richer
single-image skill text later, that is an open question (MCP `skill_read`
vs baking the roster into instructions).

### 5.3 Timeout and reconnect

| Clock | Value | What we do |
|---|---|---|
| fal JWT | 120s, refresh at 90% (`tokenExpirationSeconds`) | `tokenProvider` → `POST /api/fal/realtime-token` |
| MCP token | **~5 min** (proposed) | refresh + `session.update` (same `sid` / `threadId`) |
| Consumer Talk cap | **~3600s** | HUD ends the call with a kind "take a breath" line; user can Start again |
| xAI max session | 120 minutes | we stop first |
| Resumption idle | 30 minutes | new `sid` if they come back later (same `threadId`) |
| Connect fail | 12s (existing HUD) | Failed state |

On drop: if `resumption.enabled` and we have
`conversation.created.conversation.id`, reconnect with `conversation_id`
and the same opt-in. Re-send `session.update` (tools + fresh tokens).
Keep buffering mic as xAI's reconnect guidance says. If resumption fails,
new session **on the same `threadId`**, Elsa greets again — do not pretend
she remembers. Canvas events still target that thread's board.

`VoiceSession` (the Durable Object) outlives a single fal socket so canvas
events, digest, and the `threadId` binding survive a reconnect. Close it
on HUD End or Talk → Chat. A session that is not bound to the open
`threadId` is a bug: doodles must not land on an orphaned sid.

Local: Talk **cannot** work on `astro dev` (port 4321) for the same
reason as today — Worker entry / DO / secrets are on `pnpm dev`
(`wrangler dev --remote --env staging`). Document that on the HUD if
connect fails locally.

---

## 6. Credits and rate limits under voice

Voice does **not** bypass the ledger. MCP tools call the same `spend()` /
`checkRateLimit()` as chat.

Voice is faster: a user can ask for three doodles in one spoken minute
without typing. Existing caps (8 image gens / user / minute, 40 / org)
still apply and will start firing in Talk. That is acceptable for v1;
the spoken message already exists ("You're generating a bit fast…").

Proposed Talk-only extras (implement in phase 4 if the spike shows
runaway spend):

- Reuse the same KV buckets (`ratelimit:gen:${userId}`) so Chat + Talk
  share the minute window (do **not** give Talk a second 8/min).
- Optional: max **N** successful `generateDoodle` calls per `sid` (e.g.
  20) so a stuck VAD loop cannot drain the signup grant.
- Always emit `{ type: "credits", balance }` after a spend so the sidebar
  stays honest while the chat column is hidden (balance still lives in
  the chrome).
- `insufficient-credits`: Grok speaks the tool message; HUD shows the
  existing notice. No "Upgrade" that implies Stripe.

Video remains 1 credit per second and is **not** on the Talk allowlist
until Phase 5. Grok must not volunteer clips in v1 because it cannot
see `generateVideo`. Still not a marketed feature.

Signup: 10 free credits, 1 per image. **Talk v1 does not run pack
skills** (expressions = 9, festival = 6, etc.), so a spoken ask cannot
empty a new account in one pack. Chat still can. Pack confirmation
("that uses nine credits — go?") and enabling packs in Talk are a
**later open or Phase 4+ decision** — not v1. Do not change pricing.

---

## 7. Secrets and token endpoint

### 7.1 New secret

| Secret | Store | Prod binding | Staging binding |
|---|---|---|---|
| `FAL_KEY` | Secrets Store `801d9480d51848d69033ff869398bcbe` | `FAL_KEY` | `FAL_KEY` |

Format is fal's `key_id:key_secret`. Scope: API (model calls + platform
token mint), not an ADMIN key. **Locked default: one shared `FAL_KEY`
for prod + staging** (one fal account, same Secrets Store secret bound
in both envs). Split only if later spend dashboards force it — not the
starting plan.

Also add `FAL_KEY: SecretLike` on `Env` (`src/env.d.ts`) and
`.dev.vars.example`. Seed local via `pnpm secrets:seed-local`.

**No xAI key in this app** if fal proxies Grok Voice end-to-end (expected).
If the spike discovers fal still wants an xAI ephemeral secret, that is
a blocker: mint **only** on the Worker, never `PUBLIC_*`.

Existing secrets stay: `PICX_API_KEY`, `OPENROUTER_*` (chat), Google,
`BETTER_AUTH_SECRET_*`, `TLDRAW_LICENSE_KEY`. `PICX_WEBHOOK_SECRET` is
still required for async image/video completion (docs/secrets.md);
Talk inherits that dependency.

### 7.2 Token endpoint contract

HUD Start is **`POST /api/voice/session`**, not this route. Session mint
returns `{ sid, threadId, falJwt, mcpToken }`. This route is the
`tokenProvider` **refresh** path (and any connect that wants a fresh JWT
without minting a new VoiceSession).

`POST /api/fal/realtime-token`

- Auth: `requireOrg(..., { generation: ["create"] })`
- Server-only `readSecret(env.FAL_KEY)`
- Calls `https://rest.fal.ai/tokens/realtime` with
  `allowed_apps: ["xai/grok-voice/realtime"]`, `duration: 120`
- Returns `{ token, expiresIn: 120 }` `Cache-Control: no-store`
- Never logs the token or `FAL_KEY`

Browser:

```ts
const tokenProvider = async () => {
  const res = await fetch("/api/fal/realtime-token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  if (!res.ok) throw new Error("token");
  const { token } = await res.json();
  return token;
};

fal.realtime.connect("xai/grok-voice/realtime", {
  tokenProvider,
  tokenExpirationSeconds: 120,
});
```

---

## 8. Migration: keep vs delete

Cloudflare Voice **code stays on `dev` until Phase 5** so staging does
not go silent mid-migration. Gate the HUD on a server flag
`VOICE_BACKEND=cloudflare|grok` (env, default `cloudflare` until Phase 4
accepts) or a query `?voice=grok` for the spike only.

### 8.1 Keep (UI + contracts)

- Chat \| Talk toggle, `data-mode="voice"`, `?voice=1`, `voice-mode.css`
- One `DoodleCanvas` island + lazy HUD mount + `__doodleVoiceOpen` backlog
- Elsa / greeting / blob / consumer copy / photo upload via `/api/upload`
- `StreamEvent` union, `apply-ops.ts`, `doodleai:canvas-add` / `:canvas-ops`
- `requireOrg` generation:create
- HMAC capability-token **pattern** in `src/lib/voice/token.ts` (extend
  with `typ`, `sid`, `scp` — or a sibling `src/lib/mcp/token.ts`)
- `src/lib/voice/context.ts` as the RequestContext seam (have MCP and
  chat both call it / a renamed `buildDoodleRequestContext`)
- Mastra tools' execute logic, credits, PicX webhook, job watchers
- `agents` package **if** we still use it for MCP handler or other DOs
  (`RoadmapRoom`, `BoardRoom` do not use `agents`)

### 8.2 Delete after Grok Talk is the only Talk backend

| Remove | Why |
|---|---|
| `@cloudflare/voice` | Flux/Aura pipeline |
| `VoiceRoom` class + `VOICE_ROOM` binding | After the `VoiceSession` Durable Object exists. **VoiceSession is a new DO** (SSE fanout + event log + digest + `threadId`). Add wrangler binding `VOICE_SESSION` → `VoiceSession` and a new migration tag with `new_sqlite_classes: ["VoiceSession"]` if it is a new sqlite class. **Never delete `VoiceRoom` from migration history** — Cloudflare forbids it. Stop exporting / binding the old class later; leave historical tags in place |
| `WorkersAIFluxSTT` / `WorkersAITTS` / `AI` binding | Only if nothing else uses Workers AI. Grep before dropping `ai` from wrangler |
| `routeAgentRequest` `/agents/` branch in `entry.ts` | Only used for VoiceRoom today |
| `useVoiceAgent` | Replaced by `@fal-ai/client` realtime |
| `POST /api/voice/token` as a VoiceRoom-only mint | Replaced by `/api/voice/session` + `/api/fal/realtime-token` |

`RoadmapRoom` / `BoardRoom` are unrelated. Do not touch them.

### 8.3 VoiceSession wrangler (plan level)

When implementation starts (not this PR):

- New Durable Object class `VoiceSession` (sqlite). Binding name
  `VOICE_SESSION` (or equivalent) on prod and `env.staging`.
- New migration tag after current `v3` (`VoiceRoom`). Example shape:
  `new_sqlite_classes: ["VoiceSession"]`.
- Do **not** put `deleted_classes` / rewrite history for `VoiceRoom`.
- Do **not** store session fanout/log/digest in KV as the source of
  truth — the DO is the session.

---

## 9. Risks and open questions

### Risks

1. **fal wire protocol ≠ xAI docs.** If `xai/grok-voice/realtime` is a
   fal-shaped stream rather than `session.update` events, the spike fails
   closed and we adapt — we do not guess a second protocol in this plan.
2. **MCP from xAI cannot reach us.** SSRF-style egress allowlists on the
   provider side, Cloudflare Access on `dev.doodleai.art`, or WAF rules
   could block `/mcp`. Staging is behind Access today (`CONTRIBUTING.md`).
   **`/mcp` must be reachable from xAI/fal without a browser Access cookie.**
   May need a bypass hostname or Access service token — decide in Phase 2.
3. **Canvas digest freshness.** Chat sends digest per HTTP turn. Talk must
   POST digest on Start, after local edits, and after we apply agent ops.
   Stale digest → bad `editCanvas`.
4. **Faster credit burn** on single-image Talk (v1 omits packs, which
   removes the 6–9 credit one-shot; still easy to ask for many singles).
5. **`@fal-ai/client` + Astro 7 / Workers bundle.** Same class of risk as
   Mastra (`vite.ssr.external`). Spike must `astro build` +
   `wrangler deploy --dry-run`.
6. **Second React island.** HUD stays inside `DoodleCanvas`.
7. **CVE-2026-25536** if we reuse one MCP transport across connections.
8. **Async images.** Webhook + `PICX_WEBHOOK_SECRET` still gate
   completion. Talk cannot look "live" if webhooks are down.
9. **DO + MCP CPU time.** Keep tool handlers short (`queued` not wait).

### Open questions (need a spike answer or a product call)

1. Does fal expose the full xAI event surface (`session.update`, MCP
   `tools`, `resumption`, binary audio)?
2. Streaming HTTP vs SSE: which transport does the Grok Voice MCP client
   actually send?
3. Staging Access vs public `/mcp` — hostname, path exception, or
   separate `mcp-dev.doodleai.art`?
4. Bake **single-image** skill roster into Elsa/Grok instructions vs
   extra MCP `listSkills` / `readSkill` tools?
5. Packs in Talk (confirmation UX vs still-omitted) — **Phase 4+ /
   later**, not v1. v1 is single-image only.
6. Function-tool fallback if remote MCP is blocked?

Locked (no longer open): Elsa stays; shared `FAL_KEY` prod+staging;
Talk v1 = single-image + no `generateVideo`; MCP foundation before
full Talk UI.

---

## 10. Phased build order

Serialize. Host is memory-tight; the tldraw island is contested. One
owner for `DoodleCanvas.tsx` / `VoiceHud.tsx` at a time.

**Build priority (founder lock):** implement **our doodle MCP
foundation before full Talk UI**. After secrets/token mint, Phases 2–3
(`/mcp` ping + `generateDoodle` on the thread-bound VoiceSession DO)
are ahead of fal HUD polish (Phase 4). Phase 1 is a **thin**
speech-to-speech spike only (hear Elsa, no tools, no waveform/copy
polish). Do not expand VoiceHud cosmetics until ping + `generateDoodle`
accept.

### Phase 0 — Secrets and token mint (no product UI)

- Create **one shared** `FAL_KEY` in Secrets Store, then bind the same
  secret in prod + `env.staging`.
- `POST /api/fal/realtime-token` behind `requireOrg`.
- `.dev.vars.example` + `Env` type + seed script awareness.

**Accept:** signed-in `curl` on staging returns a JWT; signed-out is 401;
Worker logs never contain `FAL_KEY`; `allowed_apps` is only
`xai/grok-voice/realtime`. `wrangler deploy --dry-run` green.

### Phase 1 — Speech-to-speech spike (no tools, no canvas)

- `@fal-ai/client` in the existing VoiceHud (flag or `?voice=grok`).
- Connect + `session.update` (voice, instructions, server_vad) **without**
  `tools`.
- Hear Elsa, interrupt, hear her stop and answer.

**Accept:** on `dev.doodleai.art` with `pnpm dev`, a human conversation
feels like a live voice, not STT→TTS. Mic permission once. 12s connect
timeout still works. No `FAL_KEY` in the network panel. Cloudflare path
still default for everyone else.

### Phase 2 — MCP ping

- VoiceSession Durable Object + wrangler binding/migration (new sqlite
  class; do not delete `VoiceRoom` history).
- `/mcp` hello tool `ping` → `{ ok: true, sid, threadId }`.
- HUD Start → `POST /api/voice/session` `{ threadId }` →
  `{ sid, threadId, falJwt, mcpToken }`.
- `session.tools` with `allowed_tools: ["ping"]` only.
- Capability token + `X-Doodle-Session`.
- Prove xAI/fal can reach staging `/mcp` (Access decision recorded).

**Accept:** spoken "ping the doodle tools" → Grok says ok and names
`sid`. Session record has the Talk page `threadId`. Unauthenticated MCP
call 401. Wrong `sid` 401. Token from org A cannot read org B's session.
`generateVideo` is not in `allowed_tools` or token `scp`.

### Phase 3 — `generateDoodle` onto the canvas

- Extract run-function; MCP `generateDoodle`; VoiceSession DO event log +
  SSE.
- HUD subscribes and handles `status` / `media` / `notice` / `credits`
  using chat's job watcher.
- Surprise (no photo) first; then attach-photo + a **single-image**
  photo skill. No pack skills.
- `allowed_tools`: `generateDoodle` (and `ping` if still needed). No
  `generateVideo`. MCP handler rejects pack `skill` ids.

**Accept:** "draw me a tiny red dragon" (surprise) spends 1 org credit,
placeholder appears, webhook frame lands on the **same** tldraw board
(`persistenceKey doodleai-canvas-${threadId}` for the open `/c/[id]`,
`VoiceSession.threadId` matches). Not an orphaned sid. Balance updates.
Second spoken ask rate-limits with the same KV bucket as chat.
Insufficient credits → notice, no silent charge. Spoken pack request
does **not** run a pack. Chat `/api/chat` still generates (including
packs).

### Phase 4 — Full Talk UI

- Flag default → Grok. Waveform/states/copy polish.
- Digest POST + `readCanvas` / `editCanvas`.
- Photo attach via `conversation.item.create` (fal equivalent of
  today's `sendText`).
- Reconnect + 3600s cap + session close on exit.
- Optional Talk session gen cap.
- `allowed_tools`: `generateDoodle`, `readCanvas`, `editCanvas` only.
  Still no `generateVideo`. Packs remain a Phase 4+ / later decision —
  default is still single-image.

**Accept:** Chat ↔ Talk toggle never remounts a second tldraw.
Arranging after a single doodle / local edit works (digest not empty)
on the bound thread board. Reconnect after a forced socket drop keeps
the same `threadId` board. Reduced-motion static blob. User-facing
copy still says Elsa, never Grok/fal. Grok cannot call `generateVideo`
or pack skills unless a later decision opens packs.

### Phase 5 — Remove Cloudflare voice

- Delete `@cloudflare/voice` usage, VoiceRoom export, `/agents/` router,
  old token route, AI binding if unused. Keep `VoiceRoom` migration
  history.
- `generateVideo` MCP **wired** (internal-only, not marketed). This is
  the first phase it may appear on `allowed_tools` / token `scp`. Until
  then the hard gate is omit.
- Docs: this file marked implemented; secrets.md lists `FAL_KEY`.

**Accept:** `pnpm check` (or lint + tsc + dry-run) green. Staging Talk
is Grok-only. `grep` shows no `WorkersAIFluxSTT` / `useVoiceAgent`.
Prod deploy is a **separate** promote after staging soak — this plan
does not revive PR #6.

---

## 11. Acceptance criteria (roll-up)

A CTO sign-off on this doc means we may implement Phases 0–5 in later
PRs, not in this one.

| Area | Done when |
|---|---|
| Feel | Talk is speech-to-speech; Cloudflare pipeline gone from the default path |
| Tools | Grok only uses **our** MCP; `mcp.fal.ai` never configured |
| Canvas | One island; media/ops use existing StreamEvent + apply-ops |
| threadId ↔ sid | `VoiceSession` stores the open `/c/[id]` `threadId`; HUD Start mints with it; Talk doodles/ops land on `persistenceKey doodleai-canvas-${threadId}`, never an orphaned session |
| VoiceSession | Durable Object (SSE fanout + event log + digest + `threadId`); wrangler binding + new sqlite class if needed; `VoiceRoom` migration history kept |
| Video tool | `generateVideo` omitted from default `session.update` `allowed_tools` and from Phase 2–4 allowlists; Phase 5 / internal-only |
| Skills | Talk v1 **single-image only**; pack skills rejected; pack confirmation is Phase 4+ / later |
| Name | Consumer / spoken name is **Elsa**; brain is Grok; do not rename Elsa away |
| Auth | Better Auth org gate; no provider keys in JS bundles or fal JWT payload we mint beyond fal's own token |
| Money | Same ledger and per-image price; signup grant unchanged; no paid-plan copy |
| Chat | Mastra `/api/chat` behaviour unchanged |
| Ops | Shared `FAL_KEY` in Secrets Store, bound in both envs; `/mcp` reachable from the provider on staging |
| Build order | MCP foundation (ping + `generateDoodle`) accepted before Full Talk UI / HUD polish |

---

## 12. Suggested later PR slices (not this PR)

1. Shared `FAL_KEY` + `POST /api/fal/realtime-token`  
2. `/mcp` ping + VoiceSession Durable Object bound to `threadId`  
3. generateDoodle MCP + SSE + job watch (same thread board, single-image)  
4. Thin fal HUD spike behind a flag (hear Elsa; not polish) — may run in
   parallel after slice 1; does not block slices 2–3 and is not Phase 4  
5. digest + `readCanvas` / `editCanvas` + Full Talk UI polish  
6. Remove Cloudflare voice + Phase 5 `generateVideo` MCP (not v1)  

Each slice keeps Chat green and can roll back by flipping
`VOICE_BACKEND`.
