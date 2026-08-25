# Contributing to Doodle AI

Thanks for your interest in contributing! This guide will help you get set up.

## Local Development

### Prerequisites

- Node.js 20+ (recommended: use `nvm` or `fnm`)
- pnpm 9+ (`corepack enable && corepack prepare pnpm@latest --activate`)
- A free [OpenRouter](https://openrouter.ai) API key
- A free [Google Cloud](https://console.cloud.google.com/apis/credentials) OAuth 2.0 client

### Setup

```bash
git clone https://github.com/Type-Think-AI/doodle-ai.git
cd doodle-ai
pnpm install
cp .dev.vars.example .dev.vars
# Fill in your keys in .dev.vars
pnpm dev:local
```

Open [http://localhost:4321](http://localhost:4321).

This runs Astro's dev server backed by a **local** D1 database and KV store
(no Cloudflare account needed). Migrations are applied automatically on
startup. The local Secrets Store is seeded from `.dev.vars`.

### Two dev modes

| Command | What it does | Who needs it |
|---|---|---|
| `pnpm dev:local` | Fully local (miniflare D1/KV) | **Contributors** — no Cloudflare credentials |
| `pnpm dev` | `wrangler dev --remote --env staging` against the shared staging DB | **Maintainers** with Cloudflare account access |

`pnpm dev` requires `cloudflared` installed and authenticated (because the
staging domain is behind Cloudflare Access). Contributors should use
`pnpm dev:local` — it gives you a working app with your own local database.

### Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `OPENROUTER_API_KEY` | Yes | Routes chat to the AI model |
| `OPENROUTER_MODEL` | No | Default: `google/gemini-3.7-flash` |
| `BETTER_AUTH_SECRET` | Yes | Session signing (`openssl rand -base64 32`) |
| `GOOGLE_CLIENT_ID` | Yes | Google OAuth sign-in |
| `GOOGLE_CLIENT_SECRET` | Yes | Google OAuth sign-in |
| `PICX_API_KEY` | Yes* | Image generation via PicX (free at ai.picxstudio.com) |

*Without a PicX key, chat works but image generation returns an error.

## Code Style

- TypeScript strict mode
- ESLint (run `pnpm lint`)
- No `any` types unless unavoidable (comment why)
- Prefer `const` → `let` (never `var`)
- snake_case for file names, PascalCase for Astro components

## Pull Requests

1. Fork the repo and create a branch from `main`
2. Make focused, single-purpose changes
3. Run `pnpm exec tsc --noEmit` before pushing
4. Run `pnpm build` to verify production build
5. Describe what you changed and why in the PR

## What Not to Do

- Don't commit `.dev.vars`, `.env`, or any file with real API keys
- Don't add new npm dependencies without discussion
- Don't modify `wrangler.json` IDs (they're deployment-specific placeholders)
- Don't introduce new analytics/tracking without an issue first

## Analytics

The `AppLayout.astro` contains DataFast, Mixpanel, and GA4 scripts. These are for the production doodleai.art deployment. When self-hosting:
- Replace the measurement IDs with your own, OR
- Remove the analytics `<script>` blocks entirely

They are not required for the app to function.

## Architecture

See `README.md` for the project structure and `OPEN_SOURCE_PLAN.md` for the module split between open-source core and SaaS-only components.

## License

A license has not been selected yet. This will be finalized before the first public release.
