# Services and bindings (`dev`)

Source: top-level and `env.staging` in `wrangler.json`. Secret **names** only — never values. Deep secret mechanics: [../secrets.md](../secrets.md).

## Cloudflare (this Worker)

| Service | Role | Binding / where | Env notes |
|---|---|---|---|
| Worker | Astro SSR + APIs + cron + `/agents/*` DO routing | `wrangler.json` `name` / `main` (`src-worker/entry.ts`) | **Prod:** `doodleai-agent` → doodleai.art. **Staging:** `doodleai-agent-staging` → `dev.doodleai.art` (`custom_domain`). Hourly cron `0 * * * *` on the Worker. |
| Static assets | Built Astro `dist` | `assets.binding` **`ASSETS`** | Same pattern both envs. |
| D1 | Users, orgs, org credit ledger, threads, boards, generations | **`DB`** | **Prod:** database `doodleai`. **Staging:** `doodleai-staging`. Local: `wrangler.local.json` + Miniflare. |
| KV | Better Auth `secondaryStorage` (sessions), rate-limit counters | **`SESSIONS`** | Separate namespace IDs per env. Local uses a dummy id in `wrangler.local.json`. |
| Durable Object `RoadmapRoom` | tldraw sync for the public roadmap board | **`ROADMAP_ROOM`** → class `RoadmapRoom` | Same class both envs (migration tag `v1`). |
| Durable Object `BoardRoom` | tldraw sync for user boards | **`BOARD_ROOM`** → class `BoardRoom` | Same class both envs (tag `v2`). |
| Durable Object `VoiceRoom` | Cloudflare voice WebSocket (`@cloudflare/voice`) | **`VOICE_ROOM`** → class `VoiceRoom` | Same class both envs (tag `v3`). **Shipped on `dev`.** Not the planned fal `VoiceSession`. |
| R2 | Roadmap (and related) binary assets | **`ROADMAP_ASSETS`** | **Prod:** bucket `doodleai-roadmap-assets`. **Staging:** `doodleai-roadmap-assets-staging`. |
| Workers AI | Edge models for **current** voice STT/TTS | **`AI`** | Bound in both envs. Chat LLM is OpenRouter, not this binding. |

`env.*` blocks do not inherit. Every binding is repeated under `env.staging`.

## Secrets Store (names only)

Account store `801d9480d51848d69033ff869398bcbe`. Each row is a `secrets_store_secrets` binding. Values are never documented.

| Service | Role | Binding / where | Env notes |
|---|---|---|---|
| `OPENROUTER_API_KEY` | Chat model gateway | binding `OPENROUTER_API_KEY` | Shared store secret, both envs. |
| `OPENROUTER_MODEL` | Model id (app prefixes `openrouter/` if needed) | binding `OPENROUTER_MODEL` | Shared. Default in `.dev.vars.example`: `google/gemini-3.7-flash`. |
| `PICX_API_KEY` | Server-owned image/video generation | binding `PICX_API_KEY` | Shared. Never sent to the browser. |
| `GOOGLE_CLIENT_ID` | Google OAuth | binding `GOOGLE_CLIENT_ID` | Shared client; both redirect URIs must be registered. |
| `GOOGLE_CLIENT_SECRET` | Google OAuth | binding `GOOGLE_CLIENT_SECRET` | Shared. |
| `BETTER_AUTH_SECRET` | Session signing | binding `BETTER_AUTH_SECRET` | **Not shared.** Prod store name `BETTER_AUTH_SECRET_PROD`; staging `BETTER_AUTH_SECRET_STAGING`. |
| `TLDRAW_LICENSE_KEY` | Canvas licence (validated in the browser, still not committed) | binding `TLDRAW_LICENSE_KEY` | Shared store entry. Read per request, passed into the one tldraw island. |

Documented in [../secrets.md](../secrets.md) but **not** in current `wrangler.json`: `PICX_WEBHOOK_SECRET` (async PicX / video). Treat as not bound until it appears in `secrets_store_secrets`.

No `STRIPE_*` and no `FAL_KEY` in `wrangler.json`.

## Vendors (not Worker bindings)

| Service | Role | Binding / where | Env notes |
|---|---|---|---|
| PicX | Image (and video job) generation + CDN | Worker reads `PICX_API_KEY`; uploads `/api/upload`; webhooks `/api/webhooks/picx` | Same platform key both envs. Bytes live on PicX CDN, not D1. |
| OpenRouter | Mastra `doodleAgent` LLM | Worker reads `OPENROUTER_API_KEY` / `OPENROUTER_MODEL` | Used by `POST /api/chat` (and VoiceRoom `onTurn` on the Cloudflare voice path). |
| tldraw | Infinite canvas | npm `tldraw` / `@tldraw/sync` 5.3.x; licence via Secrets Store | **One** React island. Sync rooms are `BoardRoom` / `RoadmapRoom`. |
| Google OAuth | Only sign-in method | Better Auth `socialProviders.google` | Callbacks: `https://doodleai.art/api/auth/callback/google` and `https://dev.doodleai.art/api/auth/callback/google`. |

## Planned (not on `dev`)

| Service | Role | Binding / where | Env notes |
|---|---|---|---|
| `FAL_KEY` | fal Grok Voice realtime (server-only) | planned Secrets Store binding | **Planned.** Shared prod+staging unless spend dashboards force a split. Never in the browser. See [PR #7](https://github.com/Type-Think-AI/doodle-ai/pull/7). |
| `VoiceSession` DO | Talk session: SSE fanout / event log (fal path) | planned binding; do not delete `VoiceRoom` history | **Planned.** Distinct from shipped `VOICE_ROOM`. |
| `/mcp` | Our doodle MCP (tools wrap existing execute + org credit gates) | planned Worker route, **not** `mcp.fal.ai` | **Planned.** Implement MCP foundation before full Talk UI. |

Stripe checkout remains planned product work (roadmap Phase 5) with no live binding.
