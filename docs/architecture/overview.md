# System overview (`dev`)

Thin map of what is **actually running** on `dev`. Ledger, schema, and `/api/v1` design live in [../architecture.md](../architecture.md) — do not copy that file here.

```
  Browser
    Astro pages + scripts
    one tldraw island (DoodleCanvas) ──sync──► BoardRoom / RoadmapRoom
            │
            │  cookie session (Better Auth, Google)
            │  POST /api/chat   (Mastra doodleAgent)
            ▼
  Cloudflare Worker
    prod:    doodleai-agent          →  doodleai.art
    staging: doodleai-agent-staging  →  dev.doodleai.art
            │
     ┌──────┼──────────────┬────────────────┬─────────────────┐
     ▼      ▼              ▼                ▼                 ▼
    D1     KV           Durable Objects    R2              Workers AI
    DB   SESSIONS       ROADMAP_ROOM       ROADMAP_ASSETS     AI
                        BOARD_ROOM
                        VOICE_ROOM
     │
     ├── Mastra /api/chat ──► OpenRouter (chat model)
     │                     └► PicX (images / video jobs)
     └── hourly cron: credit reconcile + batch / SEO sweeps
```

## Environments

| | Production | Staging |
|---|---|---|
| Host | [doodleai.art](https://doodleai.art) | [dev.doodleai.art](https://dev.doodleai.art) |
| Worker | `doodleai-agent` | `doodleai-agent-staging` |
| Branch deploy | `main` | `dev` |

See [../deploys.md](../deploys.md).

## Credits (shipped)

- **Org ledger** — spend and grants are organization-owned (`organizationId`); `userId` is the acting member. Signup still mints a personal org.
- **Signup grant:** 10 credits (`SIGNUP_GRANT_CREDITS` in `src/lib/credits/costs.ts`).
- **Metering:** 1 credit per generated image; pack skills charge `images × 1`. Failed generations refund.
- **Stripe:** planned, not live. No `STRIPE_*` bindings in `wrangler.json`. Checkout is not a product path on `dev`.

Deep design (append-only ledger, idempotency, debit-first): [../architecture.md](../architecture.md#3-the-credit-ledger).

## Auth

Better Auth, **Google OAuth only**. Secrets never leave the Worker. Bindings in [services.md](./services.md); rotation in [../secrets.md](../secrets.md).

## Voice on `dev` vs planned Talk

**Shipped on `dev`:** Cloudflare `@cloudflare/voice` in Durable Object `VoiceRoom` (Workers AI Flux STT + Aura TTS, Mastra in `onTurn`). Plan: [../voice-mode-plan.md](../voice-mode-plan.md).

**Not shipped on `dev` (do not implement from this corpus):**

- fal Grok Voice speech-to-speech
- our hosted `/mcp` (not `mcp.fal.ai`)
- `VoiceSession` Durable Object
- `FAL_KEY`

Those plans are on [PR #7](https://github.com/Type-Think-AI/doodle-ai/pull/7). When `docs/grok-voice-realtime-plan.md` and `docs/mcp-doodle-tools.md` exist on `dev`, link them here. Do not merge PR #7 as part of docs-index work.

## Where to go next

| Need | Doc |
|---|---|
| Bindings, vendors, secret **names** | [services.md](./services.md) |
| Versions + honest drift | [tech-stack.md](./tech-stack.md) |
| Ledger / API / schema | [../architecture.md](../architecture.md) |
| Docs index | [../README.md](../README.md) |
