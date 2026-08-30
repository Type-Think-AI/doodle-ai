<p align="center">
  <img src="https://cdn.picxstudio.com/api/generated/image_865ab5a7-8bb6-41bf-abf7-a699d702a0b1.png" alt="Doodle AI — Turn any photo into a hand-drawn doodle" width="720" />
</p>

<h1 align="center">🎨 Doodle AI</h1>

<p align="center">
  <strong>Turn any photo into a playful hand-drawn doodle avatar — powered by AI.</strong>
</p>

<p align="center">
  <a href="https://doodleai.art">🌐 Live Demo</a> •
  <a href="#-skills">✨ Skills</a> •
  <a href="#-quick-start">🚀 Quick Start</a> •
  <a href="#-contributing">🤝 Contributing</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/framework-Astro_5-ff5d01?style=flat-square" alt="Astro 5" />
  <img src="https://img.shields.io/badge/runtime-Cloudflare_Workers-f38020?style=flat-square" alt="Cloudflare Workers" />
  <img src="https://img.shields.io/badge/agent-Mastra-7c3aed?style=flat-square" alt="Mastra" />
  <img src="https://img.shields.io/badge/license-MIT-green?style=flat-square" alt="MIT License" />
  <img src="https://img.shields.io/github/stars/Type-Think-AI/doodle-ai?style=flat-square" alt="Stars" />
</p>

---

## What is Doodle AI?

Doodle AI is a **conversational creative studio** that turns your photos into hand-drawn doodle art. Chat with an AI agent, attach a photo, pick a skill — and get a unique doodle avatar, collage, sticker sheet, or gift image in seconds.

There are **two ways in**:

- **The chat studio** — describe what you want, attach a photo, and the agent picks the right skill. Full run of 23 skills.
- **Free-tool pages** — single-purpose landing pages (e.g. `/photo-to-coloring-page/`, `/doodle-ideas/`) where the real prompt composer is the first thing on the page and the matching skill is already pre-pinned. 10 are live; the hub is at **[doodleai.art/tools](https://doodleai.art/tools)**. Same generator, same threads, just entered from a specific query instead of a blank chat.

> **Try it now:** [doodleai.art](https://doodleai.art) — 5 free credits on signup, no credit card needed.

---

## ✨ Skills

Every generation style is a pluggable **Skill** — a self-contained `SKILL.md` under `src/mastra/skills/`. There are **23 runnable skills** today, from single-image avatars to multi-image packs (Sticker Pack, Expression Pack, Seasonal Pack). A few, with real output:

<table>
<tr>
<td align="center" width="25%">
<img src="https://cdn.picxstudio.com/api/edited/image_12e6d35b-56e0-458c-9300-cefae33bcf46.png" width="160" /><br />
<strong>Doodle Avatar</strong><br />
<sub>1:1 hand-drawn avatar from a photo</sub>
</td>
<td align="center" width="25%">
<img src="https://cdn.picxstudio.com/api/generated/image_0cb0deb7-a9ac-4fc7-a458-b9d9bd79982f.png" width="160" /><br />
<strong>Sticker Pack</strong><br />
<sub>Die-cut sticker sheet image</sub>
</td>
<td align="center" width="25%">
<img src="https://cdn.picxstudio.com/api/generated/image_51fc5883-5be1-476f-a98d-1a57f40c7c5a.png" width="160" /><br />
<strong>Pet Portrait</strong><br />
<sub>Your pet as a hand-drawn character</sub>
</td>
<td align="center" width="25%">
<img src="https://cdn.picxstudio.com/api/generated/image_6397c145-1063-406c-b44a-49416cc92322.png" width="160" /><br />
<strong>Surprise Me</strong><br />
<sub>Fictional character, no photo needed</sub>
</td>
</tr>
</table>

The full, always-current catalogue — including the newer **Coloring Page** (`coloring`, printable line art) and **Doodle Idea** (`idea`, draw a typed idea with no photo) — is data-driven from the skill files and rendered at **[doodleai.art/skills](https://doodleai.art/skills)**. This README deliberately does **not** list all 23: the count above is interpolated from the same source the app reads, and the picker page can't drift because it *is* the source.

---

## 🖼️ Sample Outputs

<p align="center">
  <img src="https://cdn.picxstudio.com/api/generated/image_8e49ae56-a6d9-42f5-ae26-011e03e1b5c9.png" width="200" alt="Doodle avatar with wavy hair and round glasses" />
  <img src="https://cdn.picxstudio.com/api/generated/image_af9449aa-7e1e-481b-9711-f45eca01e5ae.png" width="200" alt="Doodle avatar with curly hair in a top bun" />
  <img src="https://cdn.picxstudio.com/api/generated/image_b991b561-8c11-4541-8869-145eac6070f6.png" width="200" alt="Doodle avatar in a knitted beanie" />
</p>

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────┐
│  Browser (Astro 5 SSG + client scripts)             │
│  Chat → Prompt Composer → Skill Picker → Canvas     │
└────────────────────────┬────────────────────────────┘
                         │ POST /api/chat
┌────────────────────────▼────────────────────────────┐
│  Cloudflare Worker (doodleai-agent)                  │
│  Mastra Agent → picks skill → calls generate tool   │
│  Credits: 1/gen, 5 free on signup, refund on fail   │
└────────────────────────┬────────────────────────────┘
                         │ PicX API
┌────────────────────────▼────────────────────────────┐
│  PicX Studio — image generation + CDN hosting       │
│  Permanent URL returned immediately                  │
└─────────────────────────────────────────────────────┘
```

| Layer | Tech |
|---|---|
| Frontend | Astro 5, TypeScript, scoped CSS |
| Runtime | Cloudflare Workers + D1 + KV |
| Agent | Mastra framework |
| Model | OpenRouter (configurable, default: Gemini 3.7 Flash) |
| Generation | PicX API (server-owned key) |
| Auth | Better Auth (Google OAuth) |
| Canvas | tldraw 5.3 (React island) |
| Package manager | pnpm |

---

## 🚀 Quick Start

```bash
git clone https://github.com/Type-Think-AI/doodle-ai.git
cd doodle-ai
pnpm install
cp .dev.vars.example .dev.vars
# Fill in: OPENROUTER_API_KEY, PICX_API_KEY, GOOGLE_CLIENT_ID/SECRET, BETTER_AUTH_SECRET
pnpm dev:local
```

Open [http://localhost:4321](http://localhost:4321) — local D1/KV, no Cloudflare account needed.

### Environment variables

| Variable | Required | Description |
|---|---|---|
| `OPENROUTER_API_KEY` | ✅ | Routes to the configured LLM |
| `OPENROUTER_MODEL` | ❌ | Default: `google/gemini-3.7-flash` |
| `PICX_API_KEY` | ✅ | Server-owned key for image generation |
| `BETTER_AUTH_SECRET` | ✅ | Session signing secret |
| `GOOGLE_CLIENT_ID` | ✅ | Google OAuth |
| `GOOGLE_CLIENT_SECRET` | ✅ | Google OAuth |

---

## 🛠️ Adding a New Skill

Every skill is a self-contained directory under `src/mastra/skills/`:

```
src/mastra/skills/your-skill/
├── SKILL.md          # Agent-selection description + a `metadata:` block
└── references/       # Optional supporting docs
```

A **runnable** skill (one the agent can generate with) has to be wired into four places. This isn't ceremony — three of the four are enforced by `tsc` or the loader precisely *because* the interesting failure mode is silent: a skill that half-exists, generates images, and never gets charged for them.

1. **`SKILL.md`** — top-level `description` (this is what the agent reads to pick the skill), plus a `metadata:` block with `id`, `displayName`, `runnable: true`, `requiresPhoto`, `aspectRatio`, etc. The `id` under `metadata:` — not the directory name — is the key everything else references.

2. **Register a prompt builder** in `src/lib/prompts/index.ts`. Single-image skills add an entry to `SKILL_PROMPT_BUILDERS`; multi-image "pack" skills add one to `SKILL_PACK_BUILDERS` (and their id to `PACK_SKILL_IDS` in `costs.ts`). The builder function itself lives one-per-file under `src/lib/prompts/`. Without a registered builder the skill falls through to the generic single-image prompt at run time.

3. **Add the id to `GENERATION_MODES`** in `src/lib/doodle-constants.ts`. This is the canonical list; `src/lib/skill-loader.ts` asserts at build that the set of `runnable: true` ids and `GENERATION_MODES` match *exactly* in both directions — a runnable skill missing from the list, or a mode with no skill, fails the build.

4. **Add an entry to `IMAGES_PER_RUN`** in `src/lib/credits/costs.ts`. This map is typed `Record<GenerationMode, number>`, so the moment you add an id to `GENERATION_MODES` (step 3) without pricing it here, `tsc` fails with a missing-property error. **This is the one that matters most:** credits are resolved server-side from the skill id alone, so an unpriced skill would generate images while charging nothing. Making it a typed record means "ships a skill that generates for free" is a compile error, not a production incident. Pack skills also cross-check: an id in `PACK_SKILL_IDS` priced at 1 image (or a >1 entry not in the list) throws at module load.

Then run `pnpm build` — the loader validates the whole chain and fails with a message pointing at whatever is missing.

---

## 📁 Project Structure

```
src/
├── mastra/          # Agent, skills (SKILL.md), and generation tool
├── pages/           # Astro routes (/, /c/[id], /skills/, /tools/, /settings, /api/*)
├── components/      # UI: Sidebar, Composer, Canvas, Footer, Navbar
├── scripts/app/     # Client controllers (chat, sidebar, media-picker)
├── lib/             # Auth, credits, content, admin queries
├── content/         # Editorial articles (keyword-first URLs)
├── db/              # Drizzle schema (D1)
└── styles/          # Global CSS layers
```

---

## 🤝 Contributing

We welcome contributions! See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

**Good first issues:**
- Add a new skill (a `SKILL.md` + a registered prompt builder — see [Adding a New Skill](#️-adding-a-new-skill))
- Improve an existing article in `src/content/articles/`
- Fix a bug from the [issues tab](https://github.com/Type-Think-AI/doodle-ai/issues)

```bash
# Validate your changes
pnpm exec tsc --noEmit
pnpm build
pnpm lint
```

---

## 🗺️ Roadmap

- [x] 23 generation skills — single-image (avatar, collage, pet, couple, chibi, crayon, faceless, gift, coloring, idea, family, occupation, …) and multi-image packs (stickers, mood-captions, expressions, seasonal, style-roll, childhood, festival, webtoon)
- [x] Free-tool landing pages with the composer above the fold + `/tools/` hub (10 live)
- [x] tldraw infinite canvas for generated images
- [x] Multiplayer roadmap board (Durable Objects)
- [x] Team workspaces and shared credits (org-owned ledger, invites, per-member spend, credit transfer)
- [x] SEO: keyword-first URLs, JSON-LD, FAQ schema, llms.txt
- [ ] Stripe checkout for credit packs (schema in place; checkout not switched on yet)
- [ ] User-created custom skills
- [ ] Video generation (provider-neutral adapter)
- [ ] WhatsApp + Discord channel connectors
- [ ] Character continuity across generations

---

## 📄 License

[MIT](./LICENSE) © 2026 [Type-Think-AI](https://github.com/Type-Think-AI)

---

<p align="center">
  <a href="https://doodleai.art">
    <img src="https://cdn.picxstudio.com/api/generated/image_1b9d3b74-6e31-44cd-9906-f414a92a2d70.png" width="400" alt="Try Doodle AI" />
  </a>
  <br />
  <strong><a href="https://doodleai.art">→ Try Doodle AI free</a></strong>
</p>
