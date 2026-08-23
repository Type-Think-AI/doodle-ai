# Doodle AI

Doodle AI is the separate next-version project for the new Doodle AI direction. It is intentionally isolated from the original application so both versions can continue independently:

- Original project: `/Users/yash/picx/doodlebooth`
- New project: `/Users/yash/picx/doodlebooth-agent`

The old project remains the existing production version. This project is local-only until the new UI, agent skills, and generation flows are approved.

## Product direction

The agent is the decision layer for a scalable skills-based Doodle AI:

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
| Styling | Existing Doodle AI CSS and Astro markup |
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

The app is chat-first: `/` is a prompt-box landing page, `/c/[id]` is a real
conversation thread (localStorage-backed) with the doodle agent, which can
actually run a generation mid-conversation via a Mastra tool.

```text
/Users/yash/picx/doodlebooth-agent/
├── src/
│   ├── mastra/
│   │   ├── index.ts                       # Mastra instance and agent registry
│   │   ├── agents/doodle-agent.ts         # Conversational doodle agent (skills + tools)
│   │   ├── skills/<name>/SKILL.md         # Agent Skills packages (+ optional references/) — see below
│   │   └── tools/generate-doodle.ts       # Tool the agent calls to actually generate an image
│   ├── pages/
│   │   ├── index.astro                    # Home: prompt box + skills grid landing page
│   │   ├── c/[id].astro                   # Chat thread (prerender=false)
│   │   ├── skills/{index,[id]}.astro      # Skills marketplace + detail ("Install & run" pins a skill to a new chat)
│   │   ├── moodboards.astro               # Locally-saved generated doodles
│   │   ├── settings.astro                 # PicX key, theme, default visual style
│   │   └── api/
│   │       ├── chat.ts                    # Chat turn -> doodleAgent.generate()
│   │       ├── agent.ts                   # Mode-recommendation endpoint (local-rule fallback)
│   │       ├── generate.ts                # PicX generation/edit endpoint
│   │       └── upload.ts                  # PicX managed asset upload endpoint
│   ├── scripts/app/                       # Per-page client controllers (chat.ts, home.ts, sidebar.ts, ...)
│   ├── components/app/                    # Sidebar, MobileNav, PromptComposer, SkillCard, Lightbox
│   └── lib/{doodle-constants,skills}.ts   # Prompt builders, mode data, skill catalog (from SKILL.md)
├── public/                                # Icons, fonts, and static assets
├── astro.config.mjs                       # Astro config (incl. Cloudflare/Mastra bundling workaround — see below)
├── wrangler.json                          # Future Worker identity: doodleai-agent
├── package.json                           # Project scripts and pinned dependencies
└── README.md
```

## Git and release policy

This is a fresh local git repository on branch `main` with no remote configured yet. The old repository remote was intentionally removed so this project cannot accidentally push to or deploy over the original version.

Release sequence:

1. Build and test locally.
2. Review the new UI and generation results.
3. Create a new GitHub repository/origin for this project.
4. Push this project to the new origin.
5. Create or confirm the separate Cloudflare Worker `doodleai-agent`.
6. Deploy only after explicit approval.

## Skills

Every skill is a self-contained [Agent Skills](https://agentskills.io) package — the format Mastra implements — under `src/mastra/skills/`:

```
src/mastra/skills/doodle-avatar/
├── SKILL.md          # required: frontmatter metadata + instructions
└── references/       # optional: supporting docs the agent reads on demand
    └── style-guide.md
```

`SKILL.md` frontmatter carries both halves in one place: the spec fields the agent uses (`name`, `description`, `license`, `user-invocable`) and a `metadata:` block with the app's own fields (`id`, `displayName`, `tagline`, `desc`, `longDesc`, `category`, `tags`, `runnable`, `requiresPhoto`, `aspectRatio`, `sampleIndex`, `order`). The markdown body below it is the skill's instructions.

`src/lib/skill-loader.ts` parses these once and feeds both consumers, so **a skill is added or edited in exactly one directory**:

- `src/mastra/skills/index.ts` → `createSkill()` for each `runnable: true` package, attached to the agent. The agent's prompt roster is generated from the same data rather than hardcoded.
- `src/lib/skills.ts` → the UI catalog for the marketplace, the composer's `/` picker, and the sitemap.

Packages with `runnable: false` are roadmap previews: listed in the UI as disabled cards, never attached to the agent, so the model is never offered a skill it can't run.

To add a skill: create the directory with a `SKILL.md`, give it a unique `metadata.id` and `metadata.order`, and — if it's runnable — add a matching generation mode to `GENERATION_MODES` in `src/lib/doodle-constants.ts` plus its prompt branch in `src/mastra/tools/generate-doodle.ts`. The loader validates every field, rejects duplicate ids, and cross-checks runnable ids against `GENERATION_MODES` in both directions, so a mistake fails `pnpm build` with a message naming the file — it can't reach production as a broken skill.

Loading happens at **build time** (Vite `import.meta.glob`). Mastra can also take filesystem paths in an agent's `skills` config, but that reads `SKILL.md` from disk at runtime through Node's `fs`, which doesn't exist on Cloudflare Workers — bundling keeps one authoring format working in dev, in the build, and on the deployed Worker.

## Cloudflare and Mastra note

`@mastra/core`'s optional workspace-skills feature statically pulls in a native binary (`@ast-grep/napi`) and a chunk of Node-only CLI process-spawning tooling (`execa` and its dependency chain) that Cloudflare's bundler can't resolve — none of it is on the code path `agent.generate()` + the `generateDoodle` tool actually use. `astro.config.mjs` externalizes that dependency chain (`vite.build.rollupOptions.external` / `vite.ssr.external`) so `pnpm build` succeeds; if a future `@mastra/core` upgrade pulls in a new offender, `pnpm build` will fail with a Rollup "failed to resolve import" error naming it — add it to that same external list.

No D1/KV storage or `@mastra/memory` is configured — conversation history lives client-side in `localStorage` (`src/scripts/app/chat-store.ts`), sent fresh to `/api/chat` every turn; the server stays stateless. This was a deliberate choice to avoid reopening the bundling problem above for a young feature, not a limitation of Mastra itself — see "Next scope" below.

## Next scope

Deliberately not built yet, called out so it isn't assumed done:

- **Variant generation** — the run screen design shows 3 alternate results per generation; `generateDoodle` currently returns one image per tool call.
- **"Fork as skill"** — persisting a specific run's exact prompt/settings as a new reusable custom skill. No data model for user-defined skills exists yet.
- **Server-side conversation memory** — `@mastra/memory` + a Cloudflare-compatible storage adapter (D1 or KV), once the bundling situation above is worth revisiting for this.
- **Voice input** — no speech-to-text exists; the composer intentionally has no mic button rather than a fake one.
- **User/creator-authored skills** — the marketplace is a fixed, developer-defined catalog: skills ship as `SKILL.md` packages in the repo (see "Skills" above) and are bundled at build time. That format is already the standard one a user-authored skill would arrive in, so the remaining gap is not authoring but ownership — letting any user publish their own skill, with a real author profile, needs actual accounts — this app is currently accountless/BYOK on purpose (see `privacy.astro`), so this would be a real scope change, not an incremental one: it needs auth, per-user skill storage, and moderation, not just a UI. Flagging it as a deliberate non-goal until that tradeoff is explicitly chosen.

## Original version boundary

Do not modify or deploy `/Users/yash/picx/doodlebooth` from this project. The original app and its existing Worker remain the stable version while this new Agent version is developed independently.
