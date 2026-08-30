# LANES — refresh the pages that today's work made stale (Aug 30 2026)

## What changed today, that these pages have not caught up with

1. **A new page format exists.** `category: "tool"` renders `ToolLayout.astro`:
   the real prompt composer above the fold, then real example output, then the
   prose. 10 pages are live on it. See `docs/tool-pages-plan.md`.
2. **A new hub exists at `/tools/`**, in the navbar, the footer and the sitemap.
3. **Two new skills exist**: `coloring` (Coloring Page) and `idea` (Doodle Idea).
   The catalogue is now **23 runnable skills**, not 21.
4. The 10 tool pages each show **3 unique real example images** from
   `scripts/tool-examples.json`.

## Audit findings — this is the whole stale set

I checked every static page, the AI-facing files and the docs. Only three things
are actually wrong. Do not invent more.

| File | What is wrong |
|---|---|
| `public/llms.txt` | Hand-written. Missing `coloring` and `idea`. No `/tools/` hub, no free-tools section. Two of its 23 skill links no longer match a real skill id. |
| `src/pages/llms-full.txt.ts` | Zero mentions of tools. |
| `src/pages/about.astro` | Describes the product as "a single avatar, a close-up collage, a full-body action collage". No free tools, no coloring pages, no sense of 23 skills. |
| `README.md` | Says "12 generation skills". Actual: 23. No tool pages, no `/tools/`. |

Checked and NOT stale, leave alone: `src/pages/status.astro` (a service status
page, it does not enumerate routes), `src/pages/for-studios/index.astro`,
`src/pages/skills/index.astro` (data-driven), the footer (updated today),
`docs/architecture.md`, `docs/roadmap.md`, `docs/tech-stack.md` (no hardcoded
counts).

## RESERVED — only the main agent edits these

- anything under `src/lib/`
- anything under `src/components/`
- anything under `src/layouts/`
- anything under `src/content/`
- anything under `src/mastra/`
- `src/pages/sitemap.xml.ts`, `src/pages/tools/index.astro`
- `src/consts.ts`
- `scripts/**`

If a reserved file must change, write `HANDOFF-<lane>.md` at the repo root with
the exact code and why. Do not edit it.

## Verify your own lane

```
pnpm exec eslint <your files>
pnpm build          # must stay green — you are not blocked on anyone
```

Unlike the previous wave, **the build is already green and must stay green.**
There is no "expected red" state here. If your change breaks the build, fix it.

Two pre-existing tsc errors are NOT yours and must be ignored:
`src/scripts/app/board-share.ts` (TS2393) and `src/pages/[...path].md.ts` (TS2307).

## Lane 1 — the AI-facing site map

**You own exactly these. Nothing else.**

- `src/pages/llms.txt.ts` (NEW — you create it)
- `public/llms.txt` (you DELETE it, after the route replaces it)
- `src/pages/llms-full.txt.ts` (you edit it)

`public/llms.txt` is a hand-maintained static file and it has already drifted —
it is missing the two newest skills and lists two ids that no longer exist. Do
not just patch it; that guarantees the same drift next month. **Convert it into a
generated route** so it cannot go stale:

- Read `src/pages/llms-full.txt.ts` first — it is the existing precedent for a
  generated text route in this repo. Match its shape and its `prerender` setting.
- Source skills from `src/lib/skills.ts` (`SKILLS`), NOT a hand-written list.
- Source pages from `src/lib/content/articles.ts`. It exports `getToolLinks()`
  and `getArticlesByCategory()`; `CATEGORY_LABEL` includes `tool: "Free tool"`.
- Keep every existing section of `public/llms.txt` that is still true — the
  Markdown-twins section, Product, Technical flow, Important boundaries,
  Optional, Public pages. Preserve the credit facts verbatim unless a number is
  demonstrably wrong; do not restate pricing from memory.
- ADD a `## Free tools` section listing the `category: "tool"` pages with their
  bound skill, and add `/tools/` to Public pages.
- Before deleting `public/llms.txt`, grep for anything that references it
  (`public/robots.txt`, `_headers`, any page) and confirm a generated
  `/llms.txt` still satisfies it. Report what you found.

Verify by fetching the route on the running dev server at
[localhost:4321/llms.txt](http://localhost:4321/llms.txt) and diffing it against
the old static file, so nothing true was silently dropped. Report that diff.

## Lane 2 — the about page

**You own exactly `src/pages/about.astro`. Nothing else.**

Read it first, and read `src/pages/tools/index.astro` and
`docs/tool-pages-plan.md` for what the product now is.

The page is not wrong so much as out of date: it still describes three skills and
a single chat flow. It now needs to convey that there are **two ways in** — the
conversational studio, and ~50 (10 live) single-purpose free tool pages where
the generator is the first thing on the page and the right skill is preselected.

Constraints:

- Keep the existing voice, structure and CSS. This is an update, not a redesign.
  Keep the `<h1>`, keep "What this isn't", keep "Who made this".
- Do NOT hardcode a skill count in prose. Import `SKILLS` from
  `../lib/skills` and interpolate `SKILLS.length`, so it can never drift again.
  That is the actual lesson from `llms.txt`.
- Link `/tools/` and `/skills/` at least once each.
- No marketing superlatives, no "best AI" claims. Plain, factual, same register
  as the current copy.
- Flat surfaces, thin rules — no card/panel patterns. Reuse existing classes.

## Lane 3 — the README

**You own exactly `README.md`. Nothing else.**

- "12 generation skills" is wrong; there are **23 runnable skills**. Verify the
  number yourself with `grep -l "runnable: true" src/mastra/skills/*/SKILL.md | wc -l`
  rather than trusting this document.
- The Skills table lists 12 with images. Do not hand-expand it to 23 and let it
  rot — shorten it to a representative set and point at `/skills/` for the full
  catalogue, or state the count and link out. Your call, but optimise for "cannot
  drift".
- Add the two new skills (Coloring Page, Doodle Idea) and the free-tool pages to
  the feature narrative. `/tools/` is the hub.
- The "Adding a New Skill" section is still broadly correct but now understates
  the contract. Verify against `src/lib/skill-loader.ts` and
  `src/lib/prompts/index.ts` and correct it: a new runnable skill needs a
  `SKILL.md`, a prompt builder registered in `SKILL_PROMPT_BUILDERS`, an entry in
  `GENERATION_MODES`, **and** an entry in `IMAGES_PER_RUN` in
  `src/lib/credits/costs.ts` — that last one is typed against `GenerationMode`,
  so omitting it fails `tsc` and would otherwise ship a skill that generates
  without being charged.
- Update the Roadmap checklist against what is actually true now.
- Do not touch the images or badges at the top.

## Rules for all lanes

- Do NOT spawn sub-agents of your own.
- Do NOT commit or push.
- Do NOT edit a reserved file.
- Report: files changed, what you verified, and anything you found that
  contradicts this brief.
