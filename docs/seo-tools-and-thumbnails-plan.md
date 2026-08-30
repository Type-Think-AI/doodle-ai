# Free-tool screens + real thumbnails — plan (2026-08-29)

Companion to `docs/content-inventory.md` (the generated page list) and
`docs/DoodleAI-Semrush-Keyword-Workbook-2026-08-29.xlsx` (the numbers).
Every volume/KD figure below is copied from that workbook. Nothing invented.

## What is actually shipped today

97 article files → 97 indexable keyword-first URLs. 93 carry `primaryKeyword`,
`skill`, and a `faq` block. All 100 workbook keywords that we chose to chase are
covered by a URL.

Coverage is **not** the problem. Two things are.

### Problem 1 — tool queries are answered with a guide

The workbook itself classified the page types. What we shipped is one format for
all of them:

| Workbook page type | Pages | Shipped as | Correct format |
|---|---|---|---|
| new free tool | 26 | guide article | **tool screen** |
| new learn+tool | 1 (`/doodle-ideas/`, US 9,900) | guide article | **tool screen** |
| new core landing | 23 | guide article | tool screen (converter intent) |
| rewrite existing | 16 | guide article | tool screen (converter intent) |
| new style | 9 | guide article | style gallery + generator |
| new learn | 5 | guide article | correct as-is |
| new use-case | 10 | guide article | landing + generator |
| new comparison | 2 | guide article | correct as-is |

A searcher typing `photo to coloring page` (US 1,300) or `random doodle
generator` (US 170) wants an input box, not an 1,800-word essay with a small
"Try it now" panel under the H1. `colorifyai.art` owns that SERP because it *is*
the tool. The article format is costing us the click and the conversion, not the
index.

### Problem 2 — 4 images are doing the work of 97

`heroImage` frequency across the 97 files:

| Count | Image |
|---|---|
| 53 | `image_6397c145…` (the Surprise Me sample) |
| 20 | `image_99868a77…` (full-body collage) |
| 8 | `image_33f43b6a…` |
| 4 | `image_9055f3f4…` |
| 1 each | 12 real per-article images |

Cause is known and boring: `scripts/generate-blog-thumbnails.mjs` already has the
right art direction (`HOUSE_STYLE` = hand-drawn marker doodle, cream paper,
amber/coral/charcoal, no text) but its `SUBJECTS` map only has **10 entries**.
The other 87 articles were never given a subject, so they were pointed at a
shared sample.

There is a **second, separate bug** in `src/layouts/ArticleLayout.astro`:

```ts
const displayHero = boundSkill?.thumbnailUrl || heroImage;
```

The bound skill's thumbnail *wins over* the article's own hero. So even after we
generate 87 unique thumbnails, every one of the 93 skill-bound article pages
would still render its skill thumbnail. The `/learn/` grid reads `heroImage`
directly, which is why the grid and the article page disagree today. This line
must be flipped before any credits are spent.

---

### Problem 3 — the highest-volume pages are the thinnest

Word counts across the 97 files:

| Band | Pages |
|---|---|
| 1,500+ words | 10 (the original hand-written set) |
| 600–1,500 | 1 |
| 350–600 | 49 |
| under 350 | 37 |

86 of 97 pages are under 600 words, and the thinness lands exactly on the
biggest numbers — `/cute-doodle/` (IN 22,200) is 394 words, `/doodle-drawing/`
(IN 18,100) is 286, `/doodle-art/` (US 12,100) is 293, `/coloring-page-generator/`
(US 1,300) is 253. All four also share a hero with 52 other pages.

The workbook explicitly forbade the obvious reflex ("no 1,500-word oatmeal"),
and it is right — Google does not reward padding. The legitimate fix for a
converter query is the one in Workstream C: make the page a **tool with real
generated output**, where 400 words of copy is appropriate because the unique
value is the working generator and the example media, not the prose. Thin +
templated + no unique media is a quality problem. Thin + a working tool + unique
media is just a tool page.

This is what makes the example images a cost line rather than a nice-to-have.

### The example-image budget (the real cost driver)

The workbook asks for 12+ real generated examples per page. Taken literally for
27 tool pages that is 324 images — 4,860 credits at 15/image, well beyond any
plausible balance. Three ways to size it honestly:

| Approach | Images | Credits @15 | Trade-off |
|---|---|---|---|
| 12 unique per page | 324 | 4,860 | Follows the brief; unaffordable now |
| 8 per **cluster**, shared across that cluster's pages | ~48 | 720 | Affordable; pages within a cluster show the same gallery, which weakens the "unique per URL" goal |
| 8 per cluster + 3 unique per page | ~129 | 1,935 | Each page has something only it shows, gallery cost stays bounded |

Recommendation: the third. It keeps a genuine per-URL differentiator while
holding the batch under 2,000 credits. Existing already-generated CDN images
should be inventoried and reused first — several dozen already exist from prior
thumbnail and inline-image runs.

## Workstream A — flip the hero precedence (free, 1 line)

`ArticleLayout.astro`: `heroImage || boundSkill?.thumbnailUrl`. Same fallback
behaviour for the 4 articles with no hero, but a real per-page hero is no longer
discarded. Also applies to the OG image and `ArticleSchema`, so social cards and
`Article.image` stop being identical across 53 URLs.

## Workstream B — 87 unique thumbnails

Extend `SUBJECTS` in `scripts/generate-blog-thumbnails.mjs` with one line per
remaining article, then run `--all`. No new script, no new skill package, no
change to art direction — `HOUSE_STYLE` is already the doodle theme.

Subjects are derived from the page's own job, so the set stays visually
coherent but every card is different, e.g.

- `photo-to-coloring-page` → an uncoloured outline drawing with a crayon resting on it
- `couple-doodle` → two doodle figures sharing one frame
- `whatsapp-sticker-maker` → a die-cut sticker with a white border, peeling corner
- `random-doodle-generator` → three unrelated doodle creatures in a row
- `diwali-doodle` → diya lamps and rangoli, **no deities** (workbook constraint)

### Cost, and the reason this needs a decision

Measured from `GET /v1/models` today:

| Model | Credits/image | 87 images |
|---|---|---|
| Seedream 5 Lite / Recraft V4.1 | 15 | **1,305** |
| Nano Banana 2 Lite | 20 | 1,740 |
| Nano Banana 2 @0.5K | 27 | 2,349 |
| GPT Image 2 (current default) | 53 | 4,611 |

The key's last known balance was ~1,061 credits and has been spent against
since. `/v1` exposes no balance endpoint, so this needs checking in the console
before a batch run. If the balance is short, the honest sequencing is:
thumbnail the ~25 pages that carry real volume first, leave the US-20 long tail
on a shared hero, and top up later.

## Workstream C — the tool screen

A new layout, not a new generator. `category: "tool"` added to the content
schema selects `ToolLayout.astro` instead of `ArticleLayout.astro`:

```
┌─────────────────────────────────────────┐
│ H1 (exact keyword)  · one-line subhead  │
│                                         │
│ ▓▓ REAL PROMPT COMPOSER ▓▓  ← above fold│
│    skill pre-pinned, attach, camera     │
│                                         │
│ 12 generated examples (grid)            │
│ How it works — 3 steps, no prose        │
│ FAQ (5–8, already in frontmatter)       │
│ Related tools (internal links)          │
└─────────────────────────────────────────┘
```

### The composer — your "same prompt box as home"

Today `ArticleComposer.astro` is a *visual replica* that only builds a link to
`/?skill=…&prompt=…`. It cannot attach a photo, open the camera, or @mention a
character — so on a `photo to coloring page` page, the one thing the query
demands (upload a photo) is impossible above the fold.

The fix is to drop the replica and mount the real one:
`<PromptComposer id="home" variant="hero" />` plus `src/scripts/app/home.ts`.
That controller already creates a thread and hands off to `/c/[id]`, and it
already honours `?skill=<id>`, so binding the page's skill is a data attribute,
not new logic. Zero duplicated generation code, zero new PicX call path. Needs
`AuthDialog` on the page so an anonymous visitor can sign in inline instead of
bouncing.

Where the page's job has no matching skill, the workbook's own answer applies:
use an existing one. `crayon` covers coloring pages, `surprise` covers
random/prompt/idea generators. Only `doodle-font-generator` (US 210, KD 11) and
`doodle-logo` (US 260) would need a genuinely new skill, and both are
unshipped pages, so that decision can wait.

### Which pages convert, in order

Batch 1 — 10 pages, ~7,000 combined volume, the whole coloring cluster plus the
biggest single number in the workbook:

| URL | Keyword | US | IN | KD | Skill |
|---|---|---|---|---|---|
| `/doodle-ideas/` | doodle ideas | 9,900 | – | 40 | surprise |
| `/photo-to-coloring-page/` | photo to coloring page | 1,300 | – | 27 | crayon |
| `/coloring-page-generator/` | coloring page generator | 1,300 | – | 50 | crayon |
| `/doodle-coloring-pages/` | doodle coloring pages | 1,000 | 480 | 25 | crayon |
| `/doodle-color-pages/` | doodle color pages | 590 | – | 9 | crayon |
| `/doodle-art-coloring-pages/` | doodle art coloring pages | 320 | – | 7 | crayon |
| `/coloring-pages-doodles/` | coloring pages doodles | 320 | – | 20 | crayon |
| `/coloring-doodle-pages/` | coloring doodle pages | 210 | – | 12 | crayon |
| `/random-doodle-generator/` | random doodle generator | 170 | 20 | 17 | surprise |
| `/doodle-prompt-generator/` | doodle prompt generator | 70 | – | 6 | surprise |

Batch 2 — remaining 17 "new free tool" pages (the printable/adult/free coloring
long tail, `text-to-doodle`, `image-to-doodle-converter`,
`doodle-icon-generator`, the converter variants).

Batch 3 — the 16 "rewrite existing" cartoon pages (`photo to cartoon` alone is
IN 60,500) and the 23 "new core landing" doodle-generator variants.

Batch 4 — 9 "new style" pages get a third layout: a style gallery that leads
with output images and puts the composer under it. `cute doodle` is IN 22,200
and informational, so a wall of examples is the right answer there.

## Workstream D — new pages the workbook asks for and we never built

| URL | Keyword | US | IN | KD | Note |
|---|---|---|---|---|---|
| `/tools/doodle-font-generator/` | doodle font generator | 210 | 30 | 11 | needs a new skill |
| `/tools/doodle-logo/` | doodle logo | 260 | 210 | 46 | needs a new skill |
| `/compare/doodleai-vs-canva/` | canva photo to cartoon | 880 | – | 43 | `/canva-photo-to-cartoon/` exists, wrong shape |
| `/compare/doodleai-vs-doodlemaker/` | doodle maker review | 70 | – | 23 | disambiguates the whiteboard-video SERP |

## Risk to flag now, before more pages get built

23 pages sit in "new core landing" and 15 of them are **US 20 / IN 0**, all
bound to `skill=normal`, all saying the same thing about the same product:
`/doodle-generator-free/`, `/doodle-generator-ai/`, `/ai-doodle-maker/`,
`/doodle-ai-generator/`, `/online-doodle-generator/`, `/doodle-image-generator/`…

That is the shape Google's doorway-page guidance describes: many near-identical
pages targeting keyword permutations with no distinct value per URL. The
workbook's own constraint said *"unique body per URL, no template with one noun
swapped"*. Converting them to a shared tool template makes them **more**
templated, not less. Recommendation: keep the 6–8 with real distinguishing
intent as tool screens, and 301 the rest into `/doodle-generator/`. Combined
they represent ~300 US searches; the sitewide quality risk is worth more than
that.

## Sequencing

1. **A** — flip hero precedence. 1 line, no cost, unblocks B.
2. **Check the credit balance.** Decides B's scope.
3. **B** — thumbnails for the ~25 volume-carrying pages, then the tail.
4. **C batch 1** — `ToolLayout` + real composer, 10 pages, measure.
5. **Decide the doorway consolidation** before batch 3 doubles down on it.
6. **C batches 2–4**, then **D**.

Acceptance per the workbook: every URL 200, in `sitemap.xml`, self-canonical,
`SoftwareApplication` + `FAQPage` schema, unique body, 5–10 internal links, CTA
stays Google signup + WhatsApp credits (checkout is off).
