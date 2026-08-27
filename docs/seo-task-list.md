# Doodle AI — SEO / AEO / Growth Task List

**Owner:** Yash
**Created:** 2026-08-27
**Scope:** `doodleai.art` organic search + AI-assistant visibility
**Sources:** `/Users/yash/Projects/doodle-ai/marketing/seo.md` (46 live DataForSEO keyword records), `/Users/yash/Projects/doodle-ai/marketing/aeo.md`, `/Users/yash/Projects/doodle-ai/marketing/to-do.md` (15-topic editorial backlog), plus a code audit of `src/` on 2026-08-27.

## How to use this file

- Each task has an ID (`T-01`), an effort estimate, and the keyword or metric it moves.
- Work top-down inside a phase. Phases are ordered by impact-per-hour.
- Tick the box when the change is **live in production and verified**, not when the code is written.
- `pnpm exec tsc --noEmit && pnpm build` must pass before any task is ticked.

---

## Baseline — what is already correct

Confirmed by reading the code, not assumed. Do not redo these.

| Area | Status | Where |
|---|---|---|
| SSR/SSG on Cloudflare Workers | ✅ Real HTML, not a SPA | `astro.config.mjs` |
| Static output by default | ✅ Astro 5 `output: 'static'`; only 70 routes opt out with `prerender = false`, all of them genuinely dynamic (API, admin, chat, team, share tokens) | `src/pages/**` |
| Canonical URLs | ✅ Derived from `Astro.url.pathname` for every route | `src/layouts/AppLayout.astro` |
| OG + Twitter cards | ✅ Full set incl. `og:image:width/height`, image alt | `src/layouts/AppLayout.astro` |
| JSON-LD: WebSite + SoftwareApplication | ✅ `@graph` on every page | `src/layouts/AppLayout.astro` |
| JSON-LD: Article + BreadcrumbList | ✅ Every article | `src/components/article/ArticleSchema.astro` |
| JSON-LD: FAQPage | ✅ Emitted only when `faq:` frontmatter exists (correct — no fabricated markup) | `src/components/article/ArticleSchema.astro` |
| Keyword-first URLs | ✅ `/photo-to-cartoon/` not `/blog/...`; filesystem *is* the URL | `src/content.config.ts` |
| Reserved-route collision guard | ✅ Build fails if an article shadows `/skills/` etc. | `src/lib/content/reserved-routes.ts` |
| Hand-built sitemap with real `lastmod` | ✅ Excludes noindex routes | `src/pages/sitemap.xml.ts` |
| `robots.txt` + AI crawler allows | ✅ GPTBot, ChatGPT-User, OAI-SearchBot, Google-Extended | `public/robots.txt` |
| `llms.txt` | ✅ Product, skills, boundaries, article index | `public/llms.txt` |
| Analytics | ✅ GA4 + Mixpanel + DataFast | `src/layouts/AppLayout.astro` |
| Auto related-articles by cluster | ✅ New article links into the silo with no manual edits | `src/lib/content/articles.ts` |

**Correction to an earlier claim in this session:** static content pages are *already* prerendered. Astro 5 defaults to `output: 'static'`, and `astro.config.mjs` does not override it — so `/skills/`, `/learn/`, `/about/`, the legal pages and all articles are built to static HTML and served from Cloudflare's edge. There is no prerender work to do.

---

## Phase 1 — Quick technical wins

Small, low-risk, all measurable in Search Console / PageSpeed within 2 weeks.

- [ ] **T-01 · Fix article hero `alt` text** — `1h` — *image search + a11y*
  `src/layouts/ArticleLayout.astro` renders `<img src={heroImage} alt="" />`. Empty alt on a content-bearing hero. Change to `alt={title}` (or add an optional `heroAlt` frontmatter field for a hand-written description and fall back to `title`).

- [ ] **T-02 · Add width/height + `fetchpriority` to article hero** — `1h` — *LCP, CLS*
  The hero is the LCP element on every article. Add `fetchpriority="high"` and `decoding="async"`, and explicit `width`/`height` (the container already has `aspect-ratio: 16/9`, so this is belt-and-braces against CLS).

- [ ] **T-03 · Lazy-load below-fold images** — `1h` — *LCP, bandwidth*
  ~60 inline content images exist across the 10 articles. Add `loading="lazy"` via a rehype plugin in `astro.config.mjs` so it applies to every markdown image automatically, and explicitly exclude the hero.

- [ ] **T-04 · Preload the body font** — `30m` — *LCP*
  `public/fonts/atkinson-regular.woff` is not preloaded. Add to `AppLayout.astro` head:
  `<link rel="preload" href="/fonts/atkinson-regular.woff" as="font" type="font/woff" crossorigin>`
  Also confirm `font-display: swap` in `src/styles/app.css`.

- [ ] **T-05 · Convert fonts to woff2** — `1h` — *LCP*
  Currently shipping `.woff` only (22.8KB + 23.8KB). woff2 is ~30% smaller. Keep `.woff` as a fallback `src` entry.

- [ ] **T-06 · Add `preconnect` for the image CDN** — `30m` — *LCP*
  Every article hero and inline image is served from `cdn.picxstudio.com`. Add `<link rel="preconnect" href="https://cdn.picxstudio.com" crossorigin>`.

- [ ] **T-07 · Explicit `robots` meta on indexable pages** — `30m` — *indexing clarity*
  `AppLayout.astro` only emits the tag when `noindex` is true. Emit `<meta name="robots" content="index, follow, max-image-preview:large">` otherwise. `max-image-preview:large` is what unlocks big image thumbnails in Google Discover and image-rich SERPs — relevant for a visual product.

- [ ] **T-08 · Security + cache headers** — `2h` — *ranking hygiene, TTFB*
  Add a `public/_headers` file (Cloudflare Workers static assets honour it):
  ```
  /*
    X-Content-Type-Options: nosniff
    X-Frame-Options: DENY
    Referrer-Policy: strict-origin-when-cross-origin
    Strict-Transport-Security: max-age=31536000; includeSubDomains
    Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()
  /fonts/*
    Cache-Control: public, max-age=31536000, immutable
  ```

- [ ] **T-09 · Defer the analytics stack off the critical path** — `2h` — *LCP, INP*
  Three trackers currently execute inline in `<head>`: Mixpanel (inline `is:inline` blob), GA4, DataFast. Mixpanel's snippet is the worst offender. Move Mixpanel + GA4 init into a deferred module that runs on `requestIdleCallback` (or after `load`), keeping only the theme-flash script inline. Verify `sign_up_completed` and `doodle_generated` still fire.

- [ ] **T-10 · Add `SearchAction` to the WebSite schema** — `30m` — *sitelinks searchbox*
  `/skills/` already supports search via `src/scripts/app/skills-search.ts`. Add to the `WebSite` node in `AppLayout.astro`:
  ```json
  "potentialAction": {
    "@type": "SearchAction",
    "target": { "@type": "EntryPoint", "urlTemplate": "https://doodleai.art/skills/?q={search_term_string}" },
    "query-input": "required name=search_term_string"
  }
  ```
  Requires the `/skills/` page to actually read `?q=` on load — check before shipping.

- [ ] **T-11 · Add `Organization` schema** — `1h` — *entity building, knowledge panel*
  `aeo.md` §7 calls a stable entity the highest-impact AEO move. Currently only `WebSite` + `SoftwareApplication` exist. Add an `Organization` node with `name`, `url`, `logo`, and `sameAs` pointing at every owned profile (GitHub org, X, any others). This is what lets an assistant resolve "Doodle AI" to one entity instead of confusing it with doodleai.fun.

- [ ] **T-12 · Add `offers` + `aggregateRating` to `SoftwareApplication`** — `1h` — *rich result eligibility*
  Add `offers: { "@type": "Offer", price: "0", priceCurrency: "USD", description: "5 free credits on signup" }`. **Do not add `aggregateRating` until real, displayed ratings exist** — fabricated ratings are a manual-action risk.

---

## Phase 2 — AEO / AI visibility

`marketing/aeo.md` is the spec. The single biggest gap found in the audit: **8 of 10 articles have no `faq:` frontmatter**, so `FAQPage` schema is emitted on only 2 pages. FAQ blocks are the primary format LLMs quote from.

- [ ] **T-13 · Add FAQ blocks + `faq:` frontmatter to the 8 articles missing them** — `8h` — *AI Overview citation, FAQ rich result*
  Use the live question map in `marketing/aeo.md` §5 (PAA data, not invented questions). Each needs a **visible** Q&A section in the body — the schema must describe content actually on the page.

  | Article | Has FAQ | Question source |
  |---|---|---|
  | `src/content/articles/ai-cartoon-generator/index.md` | ✅ 4 | — |
  | `src/content/articles/photo-to-sticker/index.md` | ✅ 3 | — |
  | `src/content/articles/photo-to-cartoon/index.md` | ❌ | aeo.md §5 "Photo to cartoon" |
  | `src/content/articles/cartoon-profile-picture/index.md` | ❌ | aeo.md §5 "AI profile picture" |
  | `src/content/articles/cartoon-pet-portrait/index.md` | ❌ | needs fresh PAA pull |
  | `src/content/articles/doodle-gift/index.md` | ❌ | needs fresh PAA pull |
  | `src/content/articles/mood-caption-collage/index.md` | ❌ | needs fresh PAA pull |
  | `src/content/articles/ai-cartoon-generator/prompts.md` | ❌ | prompt-specific Qs |
  | `src/content/articles/for-studios/animation-concept-sprint.md` | ❌ | B2B objection Qs |
  | `src/content/articles/for-studios/ai-filmmaker-stills.md` | ❌ | B2B objection Qs |

- [ ] **T-14 · Add a quotable answer paragraph to the top of every article** — `4h` — *AI Overview extraction*
  `aeo.md` §6 defines the format: the first paragraph must be a self-contained, 2–3 sentence factual answer that names Doodle AI, the input, and the output. An assistant should be able to lift it verbatim. Audit all 10 openings against that rule.

- [ ] **T-15 · Generate `/llms-full.txt`** — `3h` — *LLM ingestion*
  `public/llms.txt` is an index. Some crawlers prefer full text. Add a build-time endpoint (`src/pages/llms-full.txt.ts`) that concatenates every article's title, URL, description and body from the content collection. Keeps itself current with zero manual work.

- [ ] **T-16 · Per-article `.md` endpoint** — `3h` — *LLM ingestion*
  Serve raw markdown at `/{article-path}/index.md` so an assistant can fetch clean source instead of parsing HTML. Add the pattern to `llms.txt` so crawlers discover it.

- [ ] **T-17 · Add explicit disambiguation content** — `2h` — *entity resolution*
  `llms.txt` already states "Doodle AI is not doodleai.fun, InstaDoodle, LazyAvatar, or cartoonize.ai" — good. Surface the same clarity in HTML on `/about/`: what Doodle AI is, what it is not, what it cannot do (no video, no printing, no guaranteed character continuity). `aeo.md` §2 flags that AI Overviews currently answer these queries generically because nobody states the specifics.

- [ ] **T-18 · Add `dateModified` to every article** — `1h` — *freshness signal*
  `updatedDate` is optional in `src/content.config.ts` and mostly unset, so `dateModified` falls back to `pubDate`. Set `updatedDate` on every edit — both Google and assistants weight recency.

- [ ] **T-19 · Run the Grok/assistant visibility baseline** — `3h` — *measurement*
  `aeo.md` §8 defines the prompt set and §9 the cross-assistant matrix. Run it once now to get a pre-change baseline, then monthly. Without this there is no way to tell whether any AEO work landed.

---

## Phase 3 — Content gaps (highest traffic upside)

Live US volumes from `marketing/seo.md`. Sorted by unclaimed volume. Every one of these is a page that does not exist yet.

### Tier A — build first

- [ ] **T-20 · `/cartoonify-image/`** — `6h` — **6,600/mo**, Medium comp, index 55, $0.68 CPC
  Highest-volume unclaimed keyword in the whole set. `seo.md` flags "validate wording" — confirm the SERP intent is transformation (not a specific competitor tool) before writing. Cluster: `cartoon`.

- [ ] **T-21 · `/couple-cartoon/`** — `6h` — **9,900/mo**, Low comp, index 3, $0.53 CPC
  The single best volume-to-competition ratio in the dataset: 9,900 searches at competition index 3. `to-do.md` Topic 5 already briefs it ("couple avatars from photos, not generic couple cartoons"). Also captures `couple avatar` (390/mo). **This is the highest-ROI content task on the list.** Cluster: `social`.

- [ ] **T-22 · `/cartoonize-photo/`** — `5h` — **2,900/mo**, Medium comp, index 51, $2.43 CPC
  Sibling to T-20. Decide deliberately: one combined hub with the other as a section, or two pages. Two pages risk cannibalisation; check whether the SERPs differ before splitting.

- [ ] **T-23 · `/photo-to-drawing/`** — `5h` — **1,900/mo**, Medium comp, index 58, $3.41 CPC
  `to-do.md` Topic 14 briefs it as "photo to drawing vs. photo to doodle" — an honest differentiation angle, which is the right framing. Cluster: `cartoon`.

- [ ] **T-24 · `/ai-profile-picture/`** — `5h` — **1,000/mo** + `ai pfp generator` 480 + `cartoon pfp` 2,900 + `instagram profile picture cartoon` 110
  ~4,500/mo of combined PFP intent. Check overlap with the existing `/cartoon-profile-picture/` first — this may be better as a major expansion of that page plus internal links than a new URL. Cluster: `social`.

### Tier B — build after Tier A ships

- [ ] **T-25 · `/personalized-stickers/`** — `5h` — **5,400/mo**, High comp (index 100), $4.36 CPC
  High volume but a brutal SERP — dominated by print-on-demand commerce. Only worth it with a sharp "digital sheet, not printed product" angle. The Sticker Pack skill is live, so the claim is honest.

- [ ] **T-26 · `/photo-to-sketch/`** — `4h` — **2,400/mo**, High comp, index 69
  Only if the doodle style genuinely reads as a sketch. Do not claim a style the product does not produce.

- [ ] **T-27 · `/create-sticker-from-photo/`** — `4h` — **2,400/mo** + `custom sticker maker` 1,900 + `ai sticker maker` 720
  How-to format. Cross-links to the existing `/photo-to-sticker/`.

- [ ] **T-28 · `/whatsapp-sticker-maker/`** — `3h` — **720/mo**, Low comp, index 10
  Low competition and clear intent, but `llms.txt` is explicit that the Sticker Pack skill produces a **sheet image, not a WhatsApp sticker pack**. Either write it honestly as "how to get from a sheet to WhatsApp" or skip it. Do not imply a feature that does not exist.

- [ ] **T-29 · `/anime-avatar/`** — `4h` — **1,300/mo**, Low comp
  Only if an anime style is actually supported. Otherwise skip — this is a style claim, not a workflow claim.

- [ ] **T-30 · `/pet-portrait-ai/` section** — `2h` — `pet cartoon` 880 + `pet portrait ai` 110
  Extend the existing `/cartoon-pet-portrait/` rather than adding a URL. Add the secondary terms as H2s.

### Tier C — deliberately deferred

Recorded so the reasoning is not lost and nobody re-proposes them.

- `ai headshot generator` — 22,200/mo, but `seo.md` marks it "weak product fit". A doodle is not a headshot. Chasing it would produce a page that fails user intent, raising bounce and hurting the whole domain.
- `personalized photo gift` (720), `family portrait cartoon` (320), `custom cartoon portrait` (170) — all High comp / index 100, commerce-dominated SERPs.
- Brand terms (`ai doodle generator` 90, `doodle avatar` 10, `doodle pfp` 170) — real but tiny. These are brand copy, not content targets. They should rank as a side effect of everything else.

---

## Phase 4 — Product pages that convert search traffic

- [ ] **T-31 · `/pricing/` or `/credits/`** — `4h` — *"free ai cartoon generator" intent + conversion*
  There is no public pricing page. "Free" is a top qualifier on every one of these keywords, and 5 free signup credits is a genuinely strong hook that is currently invisible to search. State honestly: 5 free credits, 1 credit per generation, failed generations refunded, no paid packs yet (per `llms.txt`).

- [ ] **T-32 · `/examples/` gallery** — `6h` — *image search + conversion proof*
  A visual product with no gallery. Every article hero and the 60 inline images are already generated and hosted. Build a filterable grid (by skill), with descriptive `alt` on every tile and `ImageObject` schema. Feeds Google Images, which is a real traffic channel for this category.

- [ ] **T-33 · Comparison pages** — `5h` — *"alternative to X" intent*
  `seo.md` §competitor analysis covers ImageToCartoon, Canva, Fotor. Write honest comparisons — including where they win. Dishonest comparison pages get called out and earn nothing.

- [ ] **T-34 · Per-skill page SEO depth** — `4h` — *long tail across 7 runnable skills*
  `src/pages/skills/[id].astro` pages exist but are thin. Each should have: unique 120–160 char meta description, an H1 with the skill's keyword, 3+ example outputs, a FAQ block, `HowTo` schema **only if** the page renders genuinely discrete visible steps (`ArticleSchema.astro` documents why fabricated `HowTo` is refused — respect that rule here).

---

## Phase 5 — Internal linking + crawl architecture

- [ ] **T-35 · Auto-link entity mentions in article prose** — `4h` — *link equity distribution*
  Build a rehype plugin: first mention of "doodle avatar" → `/skills/normal/`, "sticker pack" → `/skills/stickers/`, etc. One link per term per page, never inside headings or existing links. Applies to all current and future articles automatically.

- [ ] **T-36 · "Try this skill" CTA component on articles** — `3h` — *conversion + internal links*
  Add an optional `relatedSkill` frontmatter field; render the matching `SkillCard` mid-article. Converts readers and passes equity to skill pages.

- [ ] **T-37 · Audit anchor text** — `2h` — *anchor relevance*
  Grep for generic anchors (`click here`, `read more`, `learn more`) across `src/components/` and `src/content/`. Replace with descriptive text.

- [ ] **T-38 · Add a redirect map** — `2h` — *equity preservation*
  `/privacy` → `/privacy-policy` and `/terms` → `/terms-of-service` are currently handled by dedicated `.astro` files with `prerender = false` — a whole Worker route per redirect. Consolidate into a `public/_redirects` file or one middleware map, and use it for all future URL changes. Never change a URL without a 301.

- [ ] **T-39 · Add `hreflang` / `x-default`** — `1h` — *international*
  `seo.md` includes US/India/UK comparison data. Even English-only, declaring `<link rel="alternate" hreflang="x-default">` prevents wrong-region canonicalisation.

---

## Phase 6 — Scale + automation

- [ ] **T-40 · Auto-generate OG images** — `8h` — *social CTR, removes a bottleneck*
  Today every OG image is generated manually via `scripts/generate-blog-thumbnails.mjs` and its URL pasted into `src/consts.ts` or article frontmatter. Build `src/pages/api/og/[...path].png.ts` using Satori (Workers-compatible) to render a branded card from title + category. New content gets a correct OG image with zero manual steps.

- [ ] **T-41 · Content quality CI gate** — `3h` — *prevents SEO regressions*
  Extend the Zod schema in `src/content.config.ts` and/or add a check script:
  - `description` between 120 and 160 characters (currently unbounded)
  - `title` ≤ 60 characters
  - every `guide`/`explainer` has ≥ 3 `faq` entries
  - `heroImage` is present and absolute
  Build already fails on schema violations, so this is nearly free to add.

- [ ] **T-42 · Wire up Search Console + Bing Webmaster** — `2h` — *measurement*
  Submit the sitemap, verify the domain, set the international target. Also submit to IndexNow (Bing/Yandex) — Cloudflare has a one-click IndexNow integration, which means new URLs get crawled in hours instead of days.

- [ ] **T-43 · Weekly rank tracking** — `3h` — *measurement*
  DataForSEO MCP is already configured. Script a weekly pull of positions for the ~20 target keywords into a tracked file so movement is visible without opening a dashboard.

- [ ] **T-44 · Core Web Vitals monitoring** — `2h` — *ranking signal*
  Add a CrUX/PageSpeed check to CI, or a scheduled Worker that records LCP/CLS/INP for the top 10 URLs. Catching a regression a week after it ships is much cheaper than catching it in a ranking drop.

---

## Summary

| Phase | Tasks | Effort | Primary payoff |
|---|---:|---:|---|
| 1 · Quick technical wins | 12 | ~12h | LCP/CLS, indexing clarity, rich-result eligibility |
| 2 · AEO / AI visibility | 7 | ~24h | AI Overview + assistant citations |
| 3 · Content gaps | 11 | ~49h | ~30,000/mo of unclaimed search volume |
| 4 · Product pages | 4 | ~19h | Converting the traffic phase 3 earns |
| 5 · Internal linking | 5 | ~12h | Equity distribution, crawl efficiency |
| 6 · Scale + automation | 5 | ~18h | Keeps all of the above from decaying |
| **Total** | **44** | **~134h** | |

### If you only do five things

1. **T-21 · `/couple-cartoon/`** — 9,900/mo at competition index 3. Nothing else on this list has that ratio.
2. **T-13 · FAQ blocks on 8 articles** — the single largest AEO gap; FAQ is what assistants quote.
3. **T-20 · `/cartoonify-image/`** — 6,600/mo, entirely unclaimed.
4. **T-31 · `/pricing/`** — "free" is the dominant qualifier across the whole keyword set and it is currently invisible.
5. **T-01 – T-06** — one afternoon of image/font fixes, measurable in PageSpeed.

### Guardrails

Carried over from decisions already made in this codebase. Breaking these costs more than the traffic is worth.

- **Never claim a capability the product lacks.** No video, no printing/shipping, no guaranteed character continuity, no WhatsApp sticker packs, no paid plans. `llms.txt` and `to-do.md` are already scrupulous about this — keep it that way.
- **Never fabricate structured data.** `ArticleSchema.astro` documents exactly why synthesised `HowTo` is refused. Same rule for `aggregateRating` and `FAQPage`: the content must be visible on the page.
- **Never change a URL without a 301.** The keyword-first architecture means URLs *are* the keyword targets.
- **Do not chase `ai headshot generator`** despite its 22,200/mo. Wrong product fit; a high-bounce page damages the whole domain.
- **Run `pnpm exec tsc --noEmit && pnpm build` before ticking any box.**
