# Voice Mode — architecture plan

Status: **proposed, not implemented.** This is the design for Doodle AI's
flagship voice mode: a full-screen canvas where the user *speaks*, the agent
*speaks back*, and generated doodles/animations appear on the canvas while the
agent is still talking.

All external facts below are pinned from the canonical vendor docs
([`@cloudflare/voice`](https://developers.cloudflare.com/agents/communication-channels/voice/),
[Mastra voice](https://mastra.ai/docs/agents/adding-voice)) as of 2026-09-03,
not from training data. Cloudflare's `@cloudflare/voice` is **Beta**.

---

## 1. The decision, stated plainly

**Voice runs in a new Cloudflare Durable Object using `@cloudflare/voice`
(Workers AI Deepgram Flux STT + Aura TTS). The agent brain stays the existing
Mastra `doodleAgent`, invoked from the DO's `onTurn()`.**

Two premises had to be corrected to get here:

1. **There is no managed "speech-to-speech" Cloudflare button.** Cloudflare
   gives transport (Durable Object WebSocket) + edge voice *models* (STT, TTS).
   `@cloudflare/voice` wires them into a pipeline for you, but the LLM turn in
   the middle is still your code.
2. **`@mastra/voice-cloudflare` is TTS-only.** The Mastra Cloudflare provider
   converts text→speech; its own docs say "if you need speech-to-text, consider
   one of these providers." So "Mastra + Cloudflare Voice" alone is not a
   listen+speak loop. `@cloudflare/voice` (the Agents-SDK mixin) *is* the full
   loop, because it pairs a Workers AI STT transcriber with a TTS provider and
   handles turn detection, interruption, and persistence.

Why the DO and not the existing Astro `/api/chat` Worker: a live call needs a
**stateful, long-lived WebSocket endpoint**, which the Astro request/response
Worker cannot be. Doodle already runs this exact pattern twice — `RoadmapRoom`
and `BoardRoom` are Durable Objects exported from `src-worker/entry.ts`. The
voice DO is the third instance of a proven pattern, not new infrastructure.

---

## 2. Architecture diagram

```
┌──────────────────────────── BROWSER (full-screen canvas voice UI) ─────────────────────────────┐
│                                                                                                 │
│   Mic ──16kHz mono PCM──►┐                                          ┌──► Speaker (Aura TTS mp3)  │
│                          │                                          │                           │
│   ┌──────────────────────┴──────────────────────────────────────────┴───────────────────────┐  │
│   │  useVoiceAgent()  (@cloudflare/voice/react)                                              │  │
│   │  status: idle│listening│thinking│speaking · interimTranscript · audioLevel · transcript  │  │
│   │  + sendJSON()/custommessage  ← our side-channel for canvas events                        │  │
│   └────────────────────────────────────────┬─────────────────────────────────────────────────┘  │
│                                             │  ONE WebSocket (binary audio ⇄ + JSON control)     │
│   ┌──────────── tldraw canvas (the ONE existing @tldraw/sync island, reused) ───────────────┐  │
│   │  paints image / video / canvas-ops events exactly like the text chat does today          │  │
│   └───────────────────────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────┬───────────────────────────────────────────────────┘
                                               │  wss://<host>/agents/voice-room/<sessionId>
                                               ▼
┌──────────────────────── CLOUDFLARE WORKER (doodleai-agent) ────────────────────────────────────┐
│                                                                                                 │
│   ┌──────────────── VoiceRoom  (Durable Object, extends withVoice(Agent)) ──────────────────┐  │
│   │                                                                                          │  │
│   │  transcriber = new WorkersAIFluxSTT(this.env.AI)      // @cf/deepgram/flux   (STT)       │  │
│   │  tts         = new WorkersAITTS(this.env.AI)          // @cf/deepgram/aura-1 (TTS)       │  │
│   │  SQLite: conversation history (survives DO restarts)                                     │  │
│   │                                                                                          │  │
│   │  onTurn(transcript, ctx):                                                                │  │
│   │     1. build RequestContext (userId, orgId, platformPicxKey, canvasDigest, publicOrigin) │  │
│   │     2. doodleAgent.stream(history + transcript, { requestContext })   ◄── EXISTING agent │  │
│   │     3. read fullStream:                                                                  │  │
│   │          • text-delta  → return as textStream  → TTS speaks it                           │  │
│   │          • tool-call/result (generateDoodle/Video, canvas) → this.speak side note        │  │
│   │            + sendJSON({image|video|media|canvas}) to the browser canvas                  │  │
│   └──────────────┬───────────────────────────────────────────────────┬───────────────────────┘  │
│                  │                                                     │                          │
│   ┌──────────────▼───────────────┐                    ┌────────────────▼───────────────────────┐  │
│   │ Workers AI  (binding: AI)    │                    │  Mastra doodleAgent (in-DO import)      │  │
│   │  @cf/deepgram/flux    (STT)  │                    │  model: OpenRouter google/gemini-3.7-   │  │
│   │  @cf/deepgram/aura-1  (TTS)  │                    │         flash                            │  │
│   └──────────────────────────────┘                    │  tools: generateDoodle · generateVideo  │  │
│                                                        │         readCanvas · editCanvas          │  │
│                                                        └───────────────┬──────────────────────────┘  │
│                                                                        │ PICX_API_KEY (Secrets Store) │
└────────────────────────────────────────────────────────────────────┬─┴──────────────────────────────┘
                                                                       ▼
                                              ┌──────────────── PicX generation API ───────────────┐
                                              │  images: synchronous                                │
                                              │  video:  async → webhook → /api/webhooks/picx       │
                                              │          → browser watches GET /api/v1/videos/:id   │
                                              └─────────────────────────────────────────────────────┘
```

The load-bearing reuse: the browser already knows how to paint `image`,
`video`, `media`, and `canvas` events (the `StreamEvent` union in
`src/pages/api/chat.ts`). Voice mode emits the **same events** over the DO
WebSocket via `sendJSON()` / `custommessage` instead of the NDJSON fetch
stream. Zero new canvas rendering code.

---

## 3. Services, packages, bindings, access

### 3.1 npm packages to add

| Package | Why | Notes |
|---|---|---|
| `@cloudflare/voice` | `withVoice` mixin, `WorkersAIFluxSTT`, `WorkersAITTS`, React hook | Beta |
| `agents` | Base `Agent` class the mixin wraps | peer of `@cloudflare/voice` |

Do **not** add `@mastra/node-audio` (server-side Node mic/speaker — wrong
runtime) or a second `@tldraw/sync` island (breaks the Cloudflare build via
hoisted `xxhash-wasm`; reuse the existing island).

### 3.2 Cloudflare services

| Service | Binding | Access / where it comes from | New? |
|---|---|---|---|
| Workers AI | `AI` | Account-level, no key. Provides `@cf/deepgram/flux` (STT) + `@cf/deepgram/aura-1` (TTS). | **NEW binding** — add `"ai": { "binding": "AI" }` to `wrangler.json` (prod + `env.staging`). |
| Durable Object | `VOICE_ROOM` → class `VoiceRoom` | New DO class, exported from `src-worker/entry.ts` like `RoadmapRoom`/`BoardRoom`. Needs a `migrations` entry with `new_sqlite_classes: ["VoiceRoom"]` (SQLite-backed for history). | **NEW** |
| D1 `DB` | `DB` | Existing. Credit ledger, generation rows, org/user. Reused unchanged. | existing |
| KV `SESSIONS` | `SESSIONS` | Existing. Per-user/org rate limiting in generate tools. | existing |
| Secrets Store | `PICX_API_KEY`, `OPENROUTER_API_KEY`, `OPENROUTER_MODEL` | Existing store `801d9480d51848d69033ff869398bcbe`. The DO reads these exactly as `/api/chat` does. | existing |

Account: `8928543938203aaef3040dc6fff4c8cf`. Worker: `doodleai-agent`
(prod: `doodleai.art`; staging: `doodleai-agent-staging` on `dev.doodleai.art`).

### 3.3 wrangler.json additions (both prod and `env.staging`)

```jsonc
// add at top level and inside env.staging
"ai": { "binding": "AI" },

// add to durable_objects.bindings (both blocks)
{ "name": "VOICE_ROOM", "class_name": "VoiceRoom" }

// add a new migrations tag (top-level migrations array)
{ "tag": "v3", "new_sqlite_classes": ["VoiceRoom"] }
```

No new secret is required — voice STT/TTS use the keyless `AI` binding, and the
agent's PicX + OpenRouter keys already exist in Secrets Store.

---

## 4. Files to create / touch

| File | Change |
|---|---|
| `src/voice/VoiceRoom.ts` | **NEW.** `export class VoiceRoom extends withVoice(Agent)`. Sets `transcriber`/`tts`, implements `onTurn()` to run `doodleAgent.stream()` and bridge tool/media events to `sendJSON()`. `beforeCallStart()` enforces auth + single speaker. |
| `src-worker/entry.ts` | Add `export { VoiceRoom } from "../src/voice/VoiceRoom";` (same pattern as the two existing rooms). |
| `wrangler.json` | Add `AI` binding, `VOICE_ROOM` DO binding, `v3` migration — in both prod and `env.staging`. |
| `src/pages/voice.astro` (or a `?voice=1` mode on the canvas page) | **NEW.** Full-screen canvas + voice control island. `prerender = false`. Mounts the ONE existing tldraw island + a client island using `useVoiceAgent({ agent: "VoiceRoom" })`. |
| `src/components/app/voice/VoiceCanvas.tsx` | **NEW client island.** Talk/stop control, `audioLevel` orb, `status` pill, `interimTranscript` caption; subscribes to `custommessage` and dispatches `image`/`video`/`canvas` onto the existing canvas store. |
| `src/lib/voice/context.ts` | **NEW.** Builds the same `RequestContext` shape `/api/chat` builds, callable from the DO. |
| `env.d.ts` | Add `AI: Ai` and `VOICE_ROOM: DurableObjectNamespace` to `Env`. |

The `doodleAgent` itself (`src/mastra/agents/doodle-agent.ts`) needs **no
change** — its tools and skills are reused as-is.

---

## 5. How a spoken turn flows (with the real pipeline hooks)

1. User taps "Talk" → `startCall()` → browser streams 16kHz mono PCM binary
   frames to `VoiceRoom` over one WebSocket.
2. `WorkersAIFluxSTT` runs a continuous per-call transcriber; **the model
   detects end-of-utterance** (no client end-of-speech signal needed). Interim
   partials stream back as `transcript_interim` → live caption.
3. `afterTranscribe(transcript)` (optional) — drop <3-char noise.
4. `onTurn(transcript, ctx)` runs `doodleAgent.stream(ctx.messages + transcript,
   { requestContext })`. We read `fullStream`:
   - `text-delta` → returned as the `AsyncIterable<string>` / `textStream` that
     `withVoice` sentence-chunks and feeds to `WorkersAITTS` **concurrently**
     (agent starts speaking before the full reply is generated).
   - `tool-call` for `generateDoodle`/`generateVideo` → `sendJSON({type:"status",
     phase:"drawing"|"filming"})` so the canvas shows a placeholder; a short
     spoken filler ("drawing that now") via the text stream.
   - `tool-result` → `sendJSON({type:"image"|"video"|"media", ...})` and, for
     canvas ops, `sendJSON({type:"canvas", ops})`. Same payloads as `/api/chat`.
5. `interruption`: if the user talks over playback, `@cloudflare/voice` fires
   `onInterrupt` and aborts via `context.signal` — we pass that signal into
   `agent.stream()` so an interrupted generation is cancelled cleanly.
6. History is auto-persisted to the DO's SQLite, so voice conversations survive
   DO restarts and reconnects — better than the current in-memory Mastra store.

---

## 6. Consumer language rule (Doodle is B2C, Gen-Z)

The UI must never say WebSocket / STT / TTS / latency / model / PCM. Say:
"Talk to your doodle", "it's listening", "watch it come to life while you
speak". Status labels: *Listening… · Thinking… · Drawing… · Talking…*

---

## 7. Known risks / open items

- **`@cloudflare/voice` is Beta.** API may shift; pin the version and re-verify
  against the docs before deploy.
- **Auth on the DO.** `useVoiceAgent` opens a WS directly to the agent; we must
  gate `beforeCallStart()` with the Better Auth session (capability token via
  the hook's `enabled:false`-until-ready pattern) so an unauthenticated socket
  can't spend org credits.
- **Credits.** Generation still goes through the existing credit gate in the
  tools — voice does not bypass it. But a voice user can trigger spend faster;
  confirm the per-user/org KV rate limit still applies from inside the DO.
- **`agent.stream()` inside a DO.** Needs the OpenRouter key + `nodejs_compat`;
  both already present. Verify Mastra's agent runs under the DO's execution
  context (it's the same workerd runtime as `/api/chat`, so expected to work) —
  prove with a spike before building the UI.
- **TTS format.** `WorkersAITTS` returns mp3, fine for browser playback (only a
  problem for the Twilio/PCM path, which we are not building).
- **tldraw single-island constraint** holds: reuse the existing island,
  parameterized; do not add a second `@tldraw/sync` importer.

---

## 8. Build order (flit → harden)

1. **Spike:** `VoiceRoom` with a hardcoded `onTurn` returning a string; prove
   mic→STT→TTS round-trips on `dev.doodleai.art`. (No agent, no canvas yet.)
2. Wire `doodleAgent.stream()` into `onTurn`; prove spoken replies.
3. Bridge tool/media events to `sendJSON`; prove a spoken "draw me a dragon"
   paints the canvas.
4. Full-screen canvas voice UI + consumer copy + auth gate.
5. Interruption + metrics + history polish.
```



---

## 9. Voice Mode UI — "Talk to your doodle"

Feature name (user-facing): **Live** (or "Talk mode"). Entered from a mic/wave
button; takes over the full canvas; **chat panel is hidden**; focus is 100% on
audio + the doodles appearing on the canvas.

### 9.1 The core UX rule

Voice mode is NOT the chat page with a mic added. It is a **distinct full-canvas
surface** where:

- The chat thread column (`.chat-page`) is **hidden entirely** — no message
  bubbles, no composer. The user is not reading; they are talking and watching.
- The canvas (`DoodleCanvas`, the ONE existing tldraw island) fills the screen
  and is the only content surface. Doodles/animations land directly on it as
  the agent speaks.
- A single **voice HUD** floats over the canvas: the connect button → connecting
  state → live waveform → status word. Nothing else.

This maps cleanly onto the existing layout: `ChatSplitLayout` already has a
`data-whiteboard="true"` full-canvas mode and a phone breakpoint that sets
`.chat-page { display:none }` and gives the canvas the whole screen. Voice mode
is a **new `data-mode="voice"` state on the same split**, reusing that
canvas-only composition at every width (not just phone).

### 9.2 The entry point (the button)

A small control in the canvas toolbar / composer area: a **doodle-style wave
icon** (hand-drawn squiggle, matching the doodle aesthetic — not a generic mic
glyph). Two clear affordances:

```
   ┌──────────────────────────────┐
   │  💬 Chat   ┊   〰 Talk        │   ← segmented toggle: Chat mode | Talk mode
   └──────────────────────────────┘
```

- **Chat** = today's split (chat + canvas).
- **Talk** = voice mode (canvas-only + voice HUD, chat hidden).

So the user can always get back to chat; the two modes share the same canvas and
the same agent, just a different input surface. This answers "if the user wants
chat with the talk, we customise the UI" — it's one toggle, not two apps.

### 9.3 The voice HUD states (what the button becomes)

One floating control, bottom-center over the canvas, that moves through states:

```
 IDLE          →   CONNECTING        →   LISTENING          →   THINKING         →   TALKING
 ┌────────┐        ┌────────┐            ┌──────────────┐        ┌────────┐            ┌──────────────┐
 │  〰 Talk │        │  ◌ ◌ ◌  │            │  ▁▃▅▇▅▃▁  🎤 │        │  · · ·  │            │  ▂▅▇▅▂  🔊    │
 │  to it  │        │ connecting│           │  listening…  │        │ thinking│            │  (doodle wave)│
 └────────┘        └────────┘            └──────────────┘        └────────┘            └──────────────┘
   tap to start      auto (WS opening)     mic RMS drives         agent turn            TTS playing;
                                           the waveform            (Gemini+PicX)         wave = agent voice
```

- **Connecting**: three pulsing dots / a doodle "loading squiggle" while the
  WebSocket opens and the call starts (`status: "idle" → connected`).
- **Listening**: a live **doodle-style waveform** driven by `audioLevel` (0–1
  mic RMS from `useVoiceAgent`). Hand-drawn bar/scribble style, not a clinical
  audiometer. Optional faint `interimTranscript` caption under it.
- **Thinking**: waveform settles to a calm pulse while `onTurn` runs the agent.
- **Talking**: waveform animates to the **agent's** output audio (a different
  color/tone than listening) so it visibly "feels like talking back."
- **End**: tap to stop (`endCall`), returns to IDLE.

All copy is consumer/Gen-Z (memory rule): "listening…", "thinking…",
"drawing…", "talking…" — never STT/TTS/model/latency.

### 9.4 Doodle waveform (the signature visual)

The waveform is the feature's identity, so it should feel hand-drawn, not
stock. Implementation: a small `<canvas>` or SVG island that reads `audioLevel`
(mic) during LISTENING and the assistant audio envelope during TALKING, and
draws a rough, wobbly doodle line (jitter + slight rotation, `prefers-reduced-
motion` → static). Reuse the doodle line aesthetic already in the brand. This is
its own small, self-contained component so it can be built and tuned in
isolation.

### 9.5 What shows on the canvas during a voice turn

Exactly the existing events, pushed over the DO socket via `sendJSON` and
received as `custommessage`:

- `status: drawing/filming` → the existing generation placeholder tile.
- `image` / `media` → doodle lands on the canvas (existing `apply-ops` path).
- `video` → clip lands with the existing wait-state card.
- `canvas` (ops) → agent arranges/labels, existing interpreter applies them.

No chat bubbles. If we want a minimal transcript, it's an optional collapsed
caption line in the HUD — off by default.

---

## 10. Build plan — sequenced lanes (host is memory-tight, so serialize)

The pieces have hard dependencies and one contested file (the tldraw island), so
this is **not** a wide simultaneous fan-out. Order:

### Lane 0 — Infra (must be first, blocks everything)
- `wrangler.json`: add `"ai": { "binding": "AI" }`, `VOICE_ROOM` DO binding, and
  a `v3` migration `new_sqlite_classes: ["VoiceRoom"]` — in **both** prod and
  `env.staging`.
- `env.d.ts`: add `AI: Ai` and `VOICE_ROOM: DurableObjectNamespace` to `Env`.
- `package.json`: add `@cloudflare/voice` + `agents`.
- **Verify:** `pnpm exec tsc --noEmit` + `pnpm exec wrangler deploy --dry-run`.

### Lane 1 — VoiceRoom Durable Object (the spike, depends on Lane 0)
- `src/voice/VoiceRoom.ts`: `withVoice(Agent)`, `transcriber =
  new WorkersAIFluxSTT(this.env.AI)`, `tts = new WorkersAITTS(this.env.AI)`.
- Step 1a (spike): `onTurn` returns a hardcoded string → prove mic→Flux→Aura on
  `dev.doodleai.art`.
- Step 1b: `onTurn` runs `doodleAgent.stream()` with the RequestContext built by
  `src/lib/voice/context.ts`; stream text → TTS; bridge tool/media events →
  `sendJSON`.
- `src-worker/entry.ts`: `export { VoiceRoom }`.
- Auth: `beforeCallStart` gates on the Better Auth session.

### Lane 2 — Voice HUD + doodle waveform (UI, can start after Lane 0, needs Lane 1 to fully test)
- `src/components/app/voice/VoiceHud.tsx` (client island): `useVoiceAgent`,
  the state machine (idle/connecting/listening/thinking/talking), start/stop.
- `src/components/app/voice/DoodleWaveform.tsx`: the signature hand-drawn wave.
- Consumer copy + `prefers-reduced-motion`.

### Lane 3 — Mode toggle + canvas-only layout (touches ChatSplitLayout — SINGLE owner)
- Add `data-mode="voice"` to `ChatSplitLayout`: hides `.chat-page` at all
  widths, gives canvas full width, mounts `VoiceHud`.
- The Chat|Talk segmented toggle.
- **This lane owns `ChatSplitLayout.astro` exclusively** — no other lane edits
  it (avoids the contested-shared-file failure mode).

### Lane 4 — Canvas event bridge (depends on Lane 1 + the existing apply-ops)
- Subscribe the voice HUD/canvas to `custommessage` and dispatch `image`/
  `video`/`media`/`canvas` onto the existing canvas store — reusing
  `apply-ops.ts`, NOT reimplementing it.

### Constraints every lane must respect
- **One `@tldraw/sync` island only** — reuse `DoodleCanvas`, never add a second.
- **No second brain** — the agent is `doodleAgent`, unchanged.
- **Verify behaviour, not just types** — a green `tsc` does not prove audio
  round-trips; the spike (Lane 1a) is the real gate.
- `@cloudflare/voice` is Beta — pin the version.
