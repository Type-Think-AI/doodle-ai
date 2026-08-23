# DoodleBooth Agent

DoodleBooth Agent is the separate next-version project for the new DoodleBooth direction. It is intentionally isolated from the original DoodleBooth application so both versions can continue independently:

- Original project: `/Users/yash/picx/doodlebooth`
- New project: `/Users/yash/picx/doodlebooth-agent`

The old project remains the existing production version. This project is local-only until the new UI, agent skills, and generation flows are approved.

## Product direction

The agent is the decision layer for a scalable skills-based DoodleBooth:

- Normal doodle avatar
- Close-up doodle collage
- Full-body action collage
- Future sticker packs, emotional modes, seasonal packs, and paid packs

The goal is to add new capabilities as skills and configuration, instead of creating a separate hardcoded UI for every individual feedback request.

## Tech stack

| Layer | Technology |
|---|---|
| Framework | Astro 5 + TypeScript |
| Runtime target | Cloudflare Worker, planned as a separate Worker |
| Image generation | PicX API |
| Agent framework | Mastra |
| Agent model | OpenRouter `stealth/ox-alpha` for local preview testing |
| Styling | Existing DoodleBooth CSS and Astro markup |
| Package manager | pnpm |
| Deployment | Wrangler, only after local approval |

## Local-first workflow

```bash
cd /Users/yash/picx/doodlebooth-agent
pnpm install
cp .dev.vars.example .dev.vars
# Add your local OPENROUTER_API_KEY to .dev.vars
pnpm dev
```

Local app: [http://localhost:4321](http://localhost:4321)

Run the local checks:

```bash
pnpm exec tsc --noEmit
pnpm build
pnpm exec wrangler deploy --dry-run
```

Do not run `pnpm deploy` until the new project is approved and a new Worker identity/domain has been selected.

## Environment

`.dev.vars` is local-only and ignored by git. Never commit a real API key.

```text
OPENROUTER_API_KEY=replace-with-your-openrouter-key
```

A safe template is available at `/Users/yash/picx/doodlebooth-agent/.dev.vars.example`.

The provided `stealth/ox-alpha` model is a free preview model from an anonymous third-party provider. It may change, become unavailable, or stop being free. Replace the model in `src/mastra/agents/doodle-agent.ts` if needed.

## Project structure

```text
/Users/yash/picx/doodlebooth-agent/
├── src/
│   ├── mastra/
│   │   ├── index.ts                 # Mastra instance and agent registry
│   │   └── agents/doodle-agent.ts   # Mode recommendation agent
│   ├── pages/
│   │   ├── index.astro              # New DoodleBooth Agent UI
│   │   └── api/
│   │       ├── agent.ts             # Agent recommendation endpoint
│   │       ├── generate.ts          # PicX generation/edit endpoint
│   │       └── upload.ts            # PicX managed asset upload endpoint
│   ├── scripts/doodle.ts             # Browser interaction and generation flow
│   ├── lib/doodle-constants.ts       # Prompt builders and mode data
│   └── styles/doodle.css             # DoodleBooth styling
├── public/                           # Icons, fonts, and static assets
├── astro.config.mjs                  # Astro configuration
├── wrangler.json                      # Future Worker identity: doodlebooth-agent
├── package.json                       # Project scripts and pinned dependencies
└── README.md
```

## Git and release policy

This is a fresh local git repository on branch `main` with no remote configured yet. The old repository remote was intentionally removed so this project cannot accidentally push to or deploy over the original version.

Release sequence:

1. Build and test locally.
2. Review the new UI and generation results.
3. Create a new GitHub repository/origin for this project.
4. Push this project to the new origin.
5. Create or confirm the separate Cloudflare Worker `doodlebooth-agent`.
6. Deploy only after explicit approval.

## Cloudflare and Mastra note

Mastra currently works in local Node-based Astro development. Its `@mastra/core` package currently pulls Node/native modules such as `@ast-grep/napi` into the Cloudflare bundle, so the Cloudflare production build is not yet safe for this integrated setup. This project therefore remains local-first while that limitation is resolved or while the agent is moved to the documented separate Mastra Cloudflare Worker deployment path.

No D1/KV storage is configured yet. The agent uses in-memory storage for local experiments; memory resets whenever the process restarts.

## Original version boundary

Do not modify or deploy `/Users/yash/picx/doodlebooth` from this project. The original app and its existing Worker remain the stable version while this new Agent version is developed independently.
