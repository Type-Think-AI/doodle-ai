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
pnpm dev
```

Open [http://localhost:4321](http://localhost:4321).

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

### Cloudflare Workers (optional)

`pnpm dev` runs Astro's dev server — no Cloudflare account needed. If you want to test the full Worker:

1. Create a free Cloudflare account
2. Create a D1 database: `wrangler d1 create doodleai`
3. Create a KV namespace: `wrangler kv namespace create SESSIONS`
4. Fill the IDs into `wrangler.json`
5. Run `wrangler dev`

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
