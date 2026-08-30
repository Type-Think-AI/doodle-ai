# LANES — two new skills for the free-tool pages (Aug 30 2026)

## Why this work exists

The 10 live `category: "tool"` pages are bound to the nearest AVAILABLE skill,
not the right one. `/tools/` makes it visible: the two group headings read
**"Crayon Self"** and **"Surprise Me"**.

- 7 coloring-page tools → `crayon` (Crayon Self), an ugly-cute crayon **portrait**
  skill. Nothing in it says line art, no fill, printable. Wrong skill.
- 3 idea/prompt tools → `surprise` (Surprise Me), which invents a random
  fictional character. That is not "give me doodle ideas". Wrong skill.

So: author two real skills and rebind the pages.

## THE BUILD IS RED UNTIL INTEGRATION — THIS IS EXPECTED

`src/lib/skill-loader.ts` validates **both directions**:

- every `runnable: true` skill id must appear in `GENERATION_MODES`, and
- every `GENERATION_MODES` entry must have a runnable skill.

So a new `SKILL.md` alone fails the build, and a new mode alone fails the build.
They only go green **together**, and the mode list is a RESERVED file.

**If your lane's `pnpm build` fails with a skill-loader error naming your skill
id, that is the expected state. Do NOT fix it. Do NOT edit any reserved file.**
Report done and the main agent integrates.

You can still check your own work with:

```
pnpm exec eslint <your files>
pnpm exec tsc --noEmit    # ignore pre-existing board-share.ts TS2393
```

## RESERVED — only the main agent edits these

Touching any of these will collide with the other lane and be reverted:

- `src/lib/doodle-constants.ts` (GENERATION_MODES)
- `src/lib/prompts/index.ts` (SKILL_PROMPT_BUILDERS registry + imports)
- `src/lib/credits/costs.ts`
- `src/lib/skill-loader.ts`
- `src/lib/skills.ts`
- `src/mastra/tools/generate-doodle.ts`
- `src/mastra/skills/index.ts`
- anything under `src/content/articles/`
- any layout, component or stylesheet

If you believe a reserved file must change, write
`HANDOFF-<lane>.md` at the repo root with the exact code and why. Do not edit it.

## Lane A — Coloring Page skill

**You own exactly these two NEW files. Create nothing else.**

- `src/mastra/skills/coloring-page/SKILL.md`
- `src/lib/prompts/coloring-page.ts`

Frontmatter contract, copied from `src/mastra/skills/crayon-self/SKILL.md`
(read it first — it is the reference):

```
name: coloring-page          # MUST equal the directory name
metadata:
  id: coloring               # MUST be this exact string (the generation mode)
  displayName: Coloring Page
  category: freeform         # allowed: avatars | collages | freeform | packs
  runnable: true
  requiresPhoto: true
  aspectRatio: '1:1'         # allowed: '1:1' | '3:2'
  sampleIndex: 4
  order: 21                  # 0-20 are taken
```

Do NOT set `thumbnailUrl` or `sourceImageUrl` — Lane C generates those and the
main agent writes them in.

Export exactly:

```ts
export function buildColoringPagePrompt(input: {
  themeHint: string;
  description?: string;
}): string
```

What the prompt must produce: **clean uncoloured line art from the uploaded
photo, made to be printed and coloured in by hand.** Bold confident closed
outlines, generous white space inside shapes, no fill, no shading, no gradients,
no hatching, plain white background. Recognisably the person/pet in the photo.
Hard negatives at minimum: no colour, no grey fill, no shading or crosshatching,
no photorealism, no photographic texture, no 3D, no watermark, no lettering.

Read `src/lib/prompts/crayon-self.ts` for the house shape: a WHAT TO KEEP /
WHAT TO CHANGE / MEDIUM / HARD NEGATIVES structure, `${input.themeHint}`
interpolated near the end, and `input.description` folded in as an optional
personal note. Match that structure; do not copy its content — the two skills
are opposites (crayon is deliberately bad and fully coloured, this is clean and
uncoloured).

## Lane B — Doodle Idea skill

**You own exactly these two NEW files. Create nothing else.**

- `src/mastra/skills/doodle-idea/SKILL.md`
- `src/lib/prompts/doodle-idea.ts`

```
name: doodle-idea
metadata:
  id: idea
  displayName: Doodle Idea
  category: freeform
  runnable: true
  requiresPhoto: false       # text only, like surprise-me
  aspectRatio: '1:1'
  sampleIndex: 0
  order: 22
```

Export exactly:

```ts
export function buildDoodleIdeaPrompt(input: {
  themeHint: string;
  description?: string;
}): string
```

Read `src/mastra/skills/surprise-me/SKILL.md` — it is the closest precedent
(also `requiresPhoto: false`, also `category: freeform`) — and its `SKILL.md`
body plus `buildDoodlePrompt` in `src/lib/doodle-constants.ts` for the house
doodle vocabulary.

The difference from Surprise Me, and the reason this skill exists: Surprise Me
invents a **random fictional character** and ignores what you asked for. This
skill draws **the idea the user typed** — an object, a scene, a motif, a
creature, a small still life — as a hand-drawn doodle. When `description` is
empty it should pick one interesting concrete subject rather than defaulting to
a person, because the pages that use it are "doodle ideas", "doodle prompt
generator" and "random doodle generator", where the visitor wants something to
draw, not a portrait of a stranger.

Same house style as the rest of the catalogue: naive marker-and-ink doodle, bold
clean outlines, flat cheerful colour, warm off-white ground, no lettering, no
photorealism, no 3D.

## Lane C — real example images

**You own exactly this NEW file. Edit nothing else.**

- `scripts/generate-tool-examples.mjs`

Model this on `scripts/generate-blog-thumbnails.mjs` — read it first. Reuse its
proven parts: `readApiKey()` (env then `.dev.vars`), the `generate()` POST shape
against `https://api.picxstudio.com/v1/images/generate`, `--dry-run`,
`--limit N`, and `--force`. Default model **`fal-ai/bytedance/seedream/v5/lite`**
at 15 credits — do not default to gpt-image-2 at 53.

What it generates, and nothing more:

1. A `sourceImageUrl` + `thumbnailUrl` pair for each of the two new skills, so
   the tool pages can show a true before/after instead of a single image. The
   source must be a **synthetic photorealistic portrait**, never a real person —
   see the `PHOTOREAL` constant and `SUBJECTS` map in
   `scripts/generate-skill-thumbnails.ts` for the exact approach, and note it
   runs the skill's real prompt builder via `/v1/images/edit` so the thumbnail
   is a genuine output rather than an impression of one.
2. Three example outputs per tool page for a gallery, written to a JSON manifest
   at `scripts/tool-examples.json` keyed by page slug.

**Print the resulting URLs to stdout and write the manifest. Do NOT edit any
`SKILL.md`, any article frontmatter, or any component — the main agent wires the
URLs in.** That boundary exists because `SKILL.md` is Lane A/B's file and the
articles are reserved.

`--dry-run` must work with no API key so the prompts can be reviewed before any
credits are spent. Do not spend credits on this run unless explicitly told to;
default to dry-run behaviour when unsure.

## Integration (main agent only, after A and B report)

1. Add `"coloring"` and `"idea"` to `GENERATION_MODES` in `doodle-constants.ts`.
2. Import both builders in `src/lib/prompts/index.ts` and add two
   `SKILL_PROMPT_BUILDERS` entries.
3. `pnpm build` — goes green here, not before.
4. Rebind the 7 coloring tool pages to `skill: "coloring"` and the 3 idea pages
   to `skill: "idea"`.
5. Generate the images from Lane C's script, write `thumbnailUrl` /
   `sourceImageUrl` into the two new `SKILL.md` files.
6. Verify `/tools/` group headings now read "Coloring Page" and "Doodle Idea",
   and that each tool page renders a real before/after pair.
