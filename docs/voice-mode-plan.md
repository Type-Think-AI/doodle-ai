# Voice Mode — superseded

**Status:** superseded. Do not implement from this file.

The Cloudflare `@cloudflare/voice` plan (Workers AI Flux STT → Mastra
`doodleAgent` → Aura TTS, `VoiceRoom` Durable Object) is **rejected as the
product Talk path**. It is implemented on `dev` and feels like a dead
transcribe-then-talk pipeline, not speech-to-speech.

The replacement plan is:

**[grok-voice-realtime-plan.md](./grok-voice-realtime-plan.md)**

Companion tool-schema stub:

**[mcp-doodle-tools.md](./mcp-doodle-tools.md)**

PR #6 (promote Cloudflare voice to `main`) was **closed as superseded**.
Chat mode stays on Mastra (`POST /api/chat`). Talk mode moves to fal.ai
`xai/grok-voice/realtime` plus our own remote MCP.

UI ideas that remain valid (Chat | Talk toggle, canvas-only Talk layout,
consumer copy, doodle waveform, one tldraw island) are restated in the new
plan against the code that already exists on `dev`.
