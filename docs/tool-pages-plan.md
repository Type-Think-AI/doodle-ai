# Tool pages — the `category: "tool"` conversion plan

Companion to `docs/content-inventory.md` and `docs/seo-tools-and-thumbnails-plan.md`.
Every volume and KD below is copied from
`docs/DoodleAI-Semrush-Keyword-Workbook-2026-08-29.xlsx` (Semrush, 29 Aug 2026).
Nothing is invented.

## What a tool page is

One frontmatter line — `category: "tool"` — swaps the layout from
`ArticleLayout.astro` to `ToolLayout.astro`. Same URL, same file, no redirect.

Section order, and why it is inverted from the article shell:

| # | Section | Why |
|---|---|---|
| 1 | Breadcrumb + eyebrow + H1 + one-line subhead | Four short lines of context, no 16:9 hero eating the fold |
| 2 | **The real prompt composer**, skill pre-pinned | The searcher wants an input box. This is the fold. |
| 3 | Real before/after from the bound skill | Proof, before the reader has to trust prose |
| 4 | How it works — 3 steps | Derived from the skill, so 50 pages cannot drift |
| 5 | The page's own markdown | The keyword copy, demoted below the tool |
| 6 | The skill behind this tool | Unique per skill, straight from its `SKILL.md` |
| 7 | FAQ — visible `<details>` list | What makes the `FAQPage` markup honest |
| 8 | Related tools and guides | Internal links |

It is the **real** composer (`PromptComposer` + `home.ts`), not the
`ArticleComposer` replica. The replica could only build a link to
`/?skill=…&prompt=…` — no attach, no camera, no `@mention` — so on a "photo to
coloring page" query the one thing the query demands was impossible above the
fold. Send creates a thread and hands off to `/c/[id]`, exactly as the homepage
does, so there is still one generation implementation in the codebase.

Two build-time guards in `src/content.config.ts` make a broken tool page
impossible: `category: "tool"` **requires** `skill` (a tool page with nothing to
run is a slower guide) and **requires ≥3 `faq` entries** (the FAQ is a section of
the layout, not an extra).

**Shipped as the reference:** `/photo-to-coloring-page/` — US 1,300, KD 27,
`skill: crayon`. Chosen because it is the highest-volume genuine free tool in the
workbook and its SERP is held by `colorifyai.art`, i.e. by a page that *is* the
tool. Verified in the built output: section order correct, composer above the
fold, `data-default-skill="crayon"`, 6 FAQ entries, `FAQPage` +
`SoftwareApplication` schema, no article hero.

## Readiness

All 50 conversion candidates already have a `skill` and ≥3 FAQ entries, so every
batch below is a one-line-per-page change. Nothing is blocked on content work.

## Batch 1 — 10 pages, ~7,000 combined volume

The coloring cluster plus the idea/prompt generators. Two skills cover all ten,
so the whole batch can be reviewed in one pass.

| URL | Keyword | US | IN | KD | Skill |
|---|---|---|---|---|---|
| `/doodle-ideas/` | doodle ideas | 9,900 | – | 40 | surprise |
| `/photo-to-coloring-page/` ✅ shipped | photo to coloring page | 1,300 | – | 27 | crayon |
| `/coloring-page-generator/` | coloring page generator | 1,300 | – | 50 | crayon |
| `/doodle-coloring-pages/` | doodle coloring pages | 1,000 | 480 | 25 | crayon |
| `/doodle-color-pages/` | doodle color pages | 590 | – | 9 | crayon |
| `/doodle-art-coloring-pages/` | doodle art coloring pages | 320 | – | 7 | crayon |
| `/coloring-pages-doodles/` | coloring pages doodles | 320 | – | 20 | crayon |
| `/coloring-doodle-pages/` | coloring doodle pages | 210 | – | 12 | crayon |
| `/random-doodle-generator/` | random doodle generator | 170 | 20 | 17 | surprise |
| `/doodle-prompt-generator/` | doodle prompt generator | 70 | – | 6 | surprise |

`/doodle-ideas/` is the single biggest US number in the workbook (9,900) and the
brief says explicitly it "must be a generator, not a blog". Today it is 427 words
of blog. It is the highest-leverage flip on the list.

## Batch 2 — 17 pages, the rest of the free-tool set

`/doodle-coloring-pages-for-adults/` · `/doodle-coloring-page/` ·
`/adult-doodle-coloring-pages/` · `/doodles-coloring-pages/` ·
`/printable-doodle-coloring-pages/` · `/doodle-coloring-pages-printable/` ·
`/doodle-coloring-pages-free/` · `/free-doodle-coloring-pages/` ·
`/doodle-icon-generator/` (IN 170) · `/doodle-prompts-generator/` ·
`/doodle-idea-generator/` · `/text-to-doodle/` · `/image-to-doodle-converter/`
(IN 110) · `/picture-to-doodle-converter/` · `/photo-to-doodle-converter/` ·
`/convert-photo-to-doodle/` · `/convert-photo-to-doodle-online-free/`

## Batch 3 — 23 converter landings, the biggest numbers on the site

Workbook page types "rewrite existing" and the volume-carrying "new core
landing" pages. This is where the money is: `photo to cartoon` alone is IN
60,500.

| URL | Keyword | US | IN | KD | Skill |
|---|---|---|---|---|---|
| `/photo-to-cartoon/` | photo to cartoon | 2,900 | **60,500** | 77 | normal |
| `/photo-to-sticker/` | photo to sticker | 480 | **18,100** | 42 | stickers |
| `/cartoon-profile-picture/` | cartoon profile picture | 1,300 | 5,400 | 26 | normal |
| `/whatsapp-sticker-maker/` | whatsapp sticker maker | 590 | 4,400 | 65 | stickers |
| `/ai-cartoon-generator/` | ai cartoon generator | 4,400 | 1,600 | 66 | normal |
| `/turn-photo-into-cartoon/` | turn photo into cartoon | 1,900 | 260 | 65 | normal |
| `/photo-to-cartoon-online-free/` | photo to cartoon online free | 1,600 | – | 70 | normal |
| `/cartoon-generator/` | cartoon generator | 1,300 | 320 | 47 | normal |
| `/photo-to-cartoon-free/` | photo to cartoon free | 1,000 | – | 71 | normal |
| `/photo-to-cartoon-generator/` | photo to cartoon generator | 720 | – | 68 | normal |
| `/convert-photo-to-cartoon/` | convert photo to cartoon | 590 | – | 61 | normal |
| `/doodle-maker/` | doodle maker | 320 | 590 | 30 | normal |
| `/photo-to-cartoon-app/` | photo to cartoon app | 480 | – | 71 | normal |
| `/photo-to-cartoon-ai/` | photo to cartoon ai | 480 | – | 59 | normal |
| `/convert-photo-to-cartoon-online-free/` | convert photo to cartoon online free | 480 | – | 61 | normal |
| `/photo-to-cartoon-image-converter/` | photo to cartoon image converter | 320 | – | 54 | normal |
| `/photo-to-cartoon-ai-free/` | photo to cartoon ai free | 320 | – | 50 | normal |
| `/make-a-doodle/` | make a doodle | 170 | 210 | 38 | normal |
| `/doodle-generator/` | doodle generator | 170 | 110 | 20 | normal |
| `/ai-doodle-generator/` | ai doodle generator | 90 | – | 20 | normal |
| `/picture-to-doodle/` | picture to doodle | – | 140 | 0 | normal |
| `/image-to-doodle/` | image to doodle | 20 | 90 | 0 | normal |
| `/doodle-maker-online/` | doodle maker online | 10 | 110 | 0 | normal |

Sequencing note: hold `/photo-to-cartoon/` until batches 1–2 have shown a real
engagement change. It is the site's biggest page and there is no reason to
experiment on it first.

## Do NOT convert — 16 doorway-risk pages

These are all US 20 / IN ≤ 20, all bound to `skill: normal`, all describing the
same generator in different words:

`/doodle-art-maker/` · `/doodle-art-generator/` · `/photo-to-doodle/` ·
`/online-doodle-generator/` · `/hand-drawn-image-generator/` ·
`/doodle-image-generator/` · `/doodle-generator-online/` ·
`/doodle-generator-from-photo/` · `/doodle-generator-free/` ·
`/doodle-generator-ai/` · `/doodle-drawing-generator/` · `/doodle-ai-generator/` ·
`/ai-doodle-maker/` · `/ai-doodle-generator-from-photo/` ·
`/ai-doodle-generator-free/` · `/ai-doodle-art-generator/`

Putting all sixteen on one shared tool template makes them **more** templated,
not less — sixteen URLs with an identical shell, an identical composer, an
identical skill and near-identical copy is the textbook shape of Google's
doorway-page guidance, and the workbook's own rule was "unique body per URL, no
template with one noun swapped."

Combined they are worth roughly 300 US searches. Recommendation: keep the 2–3
with genuinely distinct intent (`/photo-to-doodle/` is the exact-match phrase and
`/doodle-generator-free/` carries the free qualifier) and 301 the other thirteen
into `/doodle-generator/`. That is a deletion call, so it stays yours.

## Stay guides — 31 pages

The formats where an article is the correct answer: the 5 "new learn" pages
(`/doodle-art/` US 12,100, `/doodle-drawing/` IN 18,100,
`/how-to-turn-a-photo-into-a-cartoon/`), the 9 style pages (`/cute-doodle/` IN
22,200 is informational), the 2 comparisons, the festival and use-case landings,
and the studios workflows.

Worth revisiting later: `/cute-doodle/` (IN 22,200) and `/doodle-art/` (US
12,100) are the two largest numbers still on the article shell. Both are
informational rather than converter queries, so a **style gallery** layout —
output images leading, composer below them — is probably the right third layout
rather than either of the two that exist now.

## End state

| | Pages |
|---|---|
| Tool screens | 50 |
| Guides / explainers / prompts / studios | 31 |
| Consolidated away via 301 | 13–16 |

## Known gap

`ToolExamples.astro` shows the bound skill's real before/after plus a rail of
four sibling skills' real outputs. The workbook asks for 12+ real examples per
page; at the measured 15 credits an image that is ~4,900 credits across 50 tool
pages. Everything currently shown is a genuine generation from the skill it
claims — no stand-ins — which matters more than the count. A dedicated per-page
example set is a later, explicit credit spend, sized in
`docs/seo-tools-and-thumbnails-plan.md`.
