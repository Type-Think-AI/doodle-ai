# Doodle AI SEO keyword landings — implement this, then stop

Repo: /Users/yash/Projects/doodle-ai
Branch: feat/seo-keyword-landings (already created from origin/dev)
Date: 2026-08-29
Product: doodleai.art — photo to keepable hand-drawn doodle. Testing: checkout is OFF. CTA is Google signup (starter credits). Do not add a paywall.

You are implementing this spec in this repo. Do not invent search volumes. Do not add new generation tools or new PicX pipelines. Do not touch unrelated dirty files (ChatSplitLayout, DoodleCanvas, RoadmapBoard, wrangler.json, .dev.vars.example, tldraw-license, b/[id], c/[id], roadmap pages).

## Architecture (non-negotiable)

1. Keyword URL = markdown article under `src/content/articles/<slug>/index.md` served by existing `src/pages/[...path].astro`. Example: `articles/photo-to-doodle/index.md` → `/photo-to-doodle/`.
2. Same composer as the app. Skill pages already deep-link with `/?skill=<id>`. Homepage already auto-applies that skill. Reuse that. Do NOT build a second generator.
3. Runnable skills stay 1:1 with `GENERATION_MODES` in `src/lib/doodle-constants.ts`. Do NOT add 100 new modes. Do NOT add new `generateDoodle` tools.
4. Optional: a landing may name a **skill alias** (new SKILL.md) ONLY if `metadata.id` reuses an existing generation mode. If the loader forbids duplicate ids, add `metadata.generateMode` (existing mode) and a unique catalog `id`, then relax `assertRunnableIdsMatchGenerationModes` so every mode has ≥1 skill and every runnable skill's generateMode is in GENERATION_MODES. Prefer NOT creating aliases unless copy truly needs different agent instructions. Default: article frontmatter `skill: "normal"` (or stickers/couple/festival/gift/pet/crayon/surprise) and a CTA/composer that auto-applies that existing skill.
5. Embed the real prompt area on the article (above the fold or directly under H1): reuse the existing composer component. Preselect `data.skill`. If embedding the full composer on a public article is messy, a large in-page replica that submits into `/?skill=<id>` with the typed prompt is acceptable — but the control must look like the same text prompt area, not a generic “learn more” link. Also keep a fallback `/?skill=<id>` CTA.
6. Checkout stays off. Credits: new accounts get free starter credits; that is the “free” tool. Do not add a separate free-tool engine.
7. Festival pages: no deities. Festive portrait from a photo via Festival Pack (`festival`).
8. Unique body per URL. No template with one noun swapped. No “best AI” ranking claims. No invented volumes in on-page copy.
9. Do not create `/tools/...` routes unless `reserved-routes.ts` already allows it. Prefer root keyword URLs like the existing `/photo-to-cartoon/`.
10. Expand `cluster` enum if needed (add `doodle`, `coloring`, `festival`, `learn` — or map into existing clusters: cartoon, stickers, gifts, pets, social). Do not break existing articles.
11. Add optional article frontmatter: `skill` (generation mode or skill id), `faq` (≥5 real Q&As that also render on the page), `primaryKeyword`. Title ≤60–70 chars when possible, description 120–160.
12. Sitemap already picks up articles via the collection. Confirm new URLs appear. Canonical self.
13. ArticleSchema: SoftwareApplication and/or FAQPage only when the page actually shows that UI. Do not fabricate HowTo steps.

## Existing generation modes (reuse these)

normal, collage, full-body, surprise, stickers, mood-captions, gift, mini-me, crayon, couple, pet, faceless, moods, seasonal, expressions, style-roll, childhood, festival, webtoon, family, occupation.

## Existing articles to REWRITE (keep URL, retarget H1/title/meta, add skill + in-page composer + FAQ)

| URL | skill | Primary keyword | US vol | IN vol | KD | Notes |
|-----|-------|-----------------|-------:|-------:|---:|-------|
| /photo-to-cartoon/ | normal | photo to cartoon | 2900 | 60500 | 62 | Biggest number. India-first examples. Unique vs /ai-cartoon-generator/. |
| /photo-to-sticker/ | stickers | photo to sticker | 480 | 18100 | 30 | H1 WhatsApp doodle stickers. |
| /cartoon-profile-picture/ | normal | cartoon profile picture | 1300 | 5400 | 32 | |
| /ai-cartoon-generator/ | normal | ai cartoon generator | 4400 | 1600 | 66 | Photo input. Unique vs photo-to-cartoon. |
| /doodle-gift/ | gift | doodle gift | 50 | 140 | 21 | |
| /cartoon-pet-portrait/ | pet | pet cartoon | 320 | 170 | 34 | Also supports pet doodle intent. |

## NEW articles (P0 converters)

| URL | skill | Primary keyword | US | IN | KD | H1 | Notes |
|-----|-------|-----------------|---:|---:|---:|----|-------|
| /photo-to-doodle/ | normal | photo to doodle | 20 | 20 | 0 | Photo to Doodle Converter | Exact match missing. |
| /image-to-doodle/ | normal | image to doodle | 20 | 90 | 0 | Image to Doodle Converter | Unique intro vs photo-to-doodle. India 90. |
| /picture-to-doodle/ | normal | picture to doodle | 0 | 140 | 31 | Picture to Doodle | Highest IN doodle-converter phrase. US volume is 0. |
| /doodle-generator/ | normal | doodle generator | 170 | 110 | 20 | Doodle Generator | Lead with photo, not text-to-sketch. SERP #1 ilus.ai. |
| /ai-doodle-generator/ | normal | ai doodle generator | 90 | — | 20 | AI Doodle Generator | Do not target generic “ai doodle”. |
| /doodle-maker/ | normal | doodle maker | 320 | 590 | 30 | Doodle Maker | Still photo doodle, NOT whiteboard video (doodlemaker.com). IN 590. |
| /couple-doodle/ | couple | couple doodle | 210 | 1000 | 23 | Couple Doodle | Also supports couple cartoon IN 6600. |
| /diwali-doodle/ | festival | diwali doodle | 20 | 1000 | 29 | Diwali Doodle | No deities. SERP is Google Doodle 2008. |
| /holi-doodle/ | festival | holi doodle | 20 | 320 | 26 | Holi Doodle | No deities. |
| /ganesh-doodle/ | festival | ganesh doodle | 0 | 170 | 25 | Ganesh Chaturthi Doodle | Festive portrait only, no deity art. |
| /onam-doodle/ | festival | onam doodle | — | 70 | 0 | Onam Doodle | US not returned by Semrush. |
| /photo-to-coloring-page/ | crayon | photo to coloring page | 1300 | — | 27 | Photo to Coloring Page | Line-art from photo. Reuse crayon (or normal) via SKILL instructions, no new tool. |
| /doodle-coloring-pages/ | crayon | doodle coloring pages | 1000 | 480 | 25 | Doodle Coloring Pages | Printable PNG. Hub for coloring variants. |
| /doodle-prompt-generator/ | surprise | doodle prompt generator | 70 | — | 6 | Doodle Prompt Generator | KD 6. Prompt ideas + generate via surprise/normal. |
| /random-doodle-generator/ | surprise | random doodle generator | 170 | 20 | 17 | Random Doodle Generator | Maps to Surprise Me. |
| /doodle-ideas/ | surprise | doodle ideas | 9900 | — | 40 | Doodle Ideas | MUST be a generator+prompts page, not a Pinterest listicle. |
| /cute-doodle/ | normal | cute doodle | 3600 | 22200 | 26 | Cute Doodle | Style overlay on normal. IN 22200 is informational. |
| /doodle-portrait/ | normal | doodle portrait | 90 | 110 | 25 | Doodle Portrait | |
| /doodle-avatar-generator/ | normal | doodle avatar | 20 | — | 0 | Doodle Avatar Generator | Distinct from /skills/normal/ — keyword landing that auto-applies normal. |
| /doodle-icon-generator/ | normal | doodle icon | 110 | 170 | 21 | Doodle Icon Generator | Still a doodle from photo/idea, not a new icon engine. |
| /whatsapp-sticker-maker/ | stickers | whatsapp sticker maker | 590 | 4400 | 55 | WhatsApp Sticker Maker | Can be a thin unique page pointing at stickers skill; do not duplicate /photo-to-sticker/. |

## Additional unique landings (fill toward ~100 indexable URLs)

Create unique short converter pages (400–900 words, unique H1/FAQ/examples, same composer+skill pattern) for these remaining Semrush keywords. Skip off-intent (video, Google Doodle, dog breed, cheese doodle, competitor logins). Skip `ai drawing generator` (KD 90, Firefly).

Converters / core (map to `normal` unless noted):
- ai doodle maker, doodle art generator, ai doodle art generator, doodle drawing generator, doodle image generator, doodle art maker, online doodle generator, doodle generator free, doodle generator online, doodle generator ai, doodle ai generator, ai doodle generator free, best ai doodle generator (comparison tone, still converter), convert photo to doodle, convert photo to doodle online free, photo to doodle converter, how to turn a photo into a doodle (learn+embed), apps to doodle on photos, doodle generator from photo, ai doodle generator from photo, image to doodle converter, picture to doodle converter, hand drawn image generator, make a doodle, doodle maker online, doodle character generator, text to doodle, doodle online (only if you can disambiguate vs Google Doodle; otherwise skip)

Cartoon cluster (map to `normal`, unique vs /photo-to-cartoon/ — supporting URLs, not clones):
- photo to cartoon online free, photo to cartoon free, photo to cartoon generator, turn photo into cartoon, convert photo to cartoon, photo to cartoon ai, convert photo to cartoon online free, photo to cartoon app, photo to cartoon ai free, photo to cartoon image converter, how to turn a photo into a cartoon (learn+embed), cartoon generator, canva photo to cartoon (comparison: doodle vs Canva, still our converter)

Coloring hub children (map to `crayon`, unique 1-paragraph angle each, link to /doodle-coloring-pages/):
- doodle color pages, coloring pages doodles, doodle art coloring pages, coloring doodle pages, cute doodle coloring pages, doodles coloring pages, adult doodle coloring pages, doodle coloring page, doodle coloring pages for adults, easy doodle coloring pages, kawaii doodle coloring pages, doodle coloring pages printable, printable doodle coloring pages, doodle coloring pages free, free doodle coloring pages, zen doodle coloring pages, christmas doodle coloring pages, coloring page generator

Learn/style (embed generator, not blogs):
- doodle prompts, doodle prompt generator (if not already), doodle idea generator, doodle prompts generator, doodle art, doodle drawing, doodle sketch, cartoon doodles, doodle cartoon

Skip: doodle video maker, ai doodle video generator, doodle maker login, doodle maker review (optional comparison only), instadoodle, doodle clipart/png/images as stock-dump pages, festival doodle (0/0), cute doodle generator (0), ai doodle drawing (0), word doodle generator free, doodle font generator (unless you can honestly do it with surprise — if not, skip), doodle logo (KD 46, skip unless a thin normal page is honest).

URL slug = keyword kebab-case at site root. If two keywords collide, fold the weaker into the stronger page as a supporting H2, do not duplicate.

## Every new/rewritten page must include

- Unique H1, title, meta description
- Direct-answer opening paragraph (AEO)
- In-page composer (same prompt UI) with skill auto-applied + CTA “Create your doodle”
- 5–8 FAQ that actually render (and `faq` frontmatter)
- 8–12 example images: reuse existing skill `thumbnailUrl` / CDN samples from this repo. Do not invent customer photos. Label samples as product samples, not customer proof.
- 5–10 internal links to sibling keyword pages + `/skills/<id>/`
- India-relevant examples on cartoon, sticker, picture-to-doodle, couple, festival
- No checkout, no “best AI” claims, no Semrush numbers on the page

## Code changes expected

1. `src/content.config.ts` — optional `skill`, `primaryKeyword`; maybe extra clusters.
2. `ArticleLayout.astro` — embed composer / try-it panel bound to `data.skill`.
3. Confirm `/?skill=` still works; if article embeds composer, wire the same skill-chip preselect used on the home app (search `skill=` in the homepage scripts).
4. Rewrite the 6 existing articles listed.
5. Add all P0 new articles.
6. Add the additional unique landings (honest unique copy).
7. `reserved-routes.ts` — do not collide with /skills, /boards, /c, /b, /admin, /api, /learn, /join, /team, /settings.
8. If you add skill aliases, update skill-loader uniqueness rules as specified. Default is reuse existing skills.
9. PR-ready: do not commit secrets. Do not git push unless asked.

## Acceptance

- `astro check` / build does not fail on content schema or skill-loader asserts.
- `/photo-to-doodle/`, `/doodle-generator/`, `/doodle-maker/`, `/picture-to-doodle/`, `/couple-doodle/`, `/diwali-doodle/` return article pages with composer + skill.
- Rewritten `/photo-to-cartoon/` H1 contains “Photo to Cartoon” and auto-applies `normal`.
- `/photo-to-sticker/` H1 contains sticker/WhatsApp language and auto-applies `stickers`.
- No new PicX/generateDoodle modes.
- A short `docs/seo-pages-shipped.md` table: URL | primary keyword | skill | US vol | IN vol | KD copied from this spec (do not invent).

Start by reading ArticleLayout, content.config.ts, homepage `?skill=` handling, one existing article, and reserved-routes.ts. Then implement infrastructure (frontmatter + composer embed), then P0 rewrites, then P0 new pages, then the rest. Keep going until the acceptance list is true.
