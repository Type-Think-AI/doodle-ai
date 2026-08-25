# Doodle AI SEO Research Report

**Prepared:** 2026-08-24
**Updated:** 2026-08-25 (live sitemap/skill-page check, ChatGPT sticker launch, doodle-entity collisions)
**Project:** [Doodle AI](https://doodleai.art)
**Repository:** `/Users/yash/picx/doodlebooth-agent`
**Primary market used for prioritisation:** United States, English
**Decision goal:** Select keywords and landing-page opportunities for Doodle AI's photo-to-doodle, avatar, cartoon, sticker, gift, and visual-transformation products.

> This is a live-data research report, not a guarantee of future rankings. Search volume is an estimate, competition is primarily paid-search competition, and ranking difficulty still requires manual SERP and backlink evaluation.

## 1. Executive decision summary

### Build first

1. **Photo-to-cartoon hub** — target `photo to cartoon` (4,400 US searches/month, medium paid competition, competition index 46), with supporting pages for `cartoonize photo`, `turn photo into cartoon`, `photo to drawing`, and `photo to sketch`.
2. **Cartoon profile-picture page** — target `profile picture cartoon` (1,900/month, competition index 1) and `cartoon pfp` (2,900/month; Google Ads did not return a competition index). This is a close match for Doodle AI's avatar product and has a better initial opportunity than the broadest headshot terms.
3. **AI cartoon generator page** — target `ai cartoon generator` (4,400/month, medium competition index 49). It is competitive, but it is the most important discovery page because Google showed an AI Overview for this query.
4. **Photo-to-sticker page** — target `photo to sticker` (4,400/month, high competition index 100) only for the **die-cut sticker sheet** the product actually makes. The Sticker Pack skill is runnable at `/skills/stickers/`. Do not compete for WhatsApp/iMessage sticker intent: ChatGPT Images launched native transparent stickers with chat-app export on 2026-08-24, and the live SERP is already dominated by printing and phone-native sticker utilities.
5. **Pet and couple use cases** — target `pet cartoon` (880/month, low index 11) and `couple avatar` (390/month, low paid competition). These are smaller but highly aligned with visual sharing and gifting.

### Do not prioritise yet

- `ai headshot generator` has the largest measured volume (22,200/month) but is a broad, professional-headshot intent with a high commercial bar and weak product fit for a playful doodle studio.
- `couple cartoon` has 9,900/month but the live SERP is informational/image-heavy: Bored Panda, Pinterest, Adobe Stock, Reddit, and image results. It is not the same intent as “make a couple avatar from our photo.” Build a dedicated `couple avatar` page rather than trying to win the generic phrase immediately.
- `ai doodle avatar` and `ai gift from photo` returned no Google Ads volume in this live request. Keep them as brand/product terms, not as evidence of search demand.

### Best initial editorial bet

Use the **existing skill catalog as the first public cluster**, then add keyword hubs only where a skill page cannot honestly rank:

Already live and in the sitemap:

- `/skills/` — public hub (the homepage is intentionally **not** in the sitemap)
- `/skills/normal/` — doodle avatar from a photo
- `/skills/collage/`, `/skills/full-body/`
- `/skills/stickers/` — die-cut sheet, not a messaging sticker
- `/skills/mood-captions/`, `/skills/gift/`, `/skills/surprise/`

Add later, only with real examples and FAQ content:

- `/photo-to-cartoon/` or a substantially expanded `/skills/normal/`
- `/ai-cartoon-generator/`
- `/cartoon-profile-picture/`
- `/pet-cartoon/`
- `/couple-avatar/`
- `/photo-to-sketch/`
- `/blog/how-to-turn-a-photo-into-a-cartoon/` — blocked until there is at least one real post; `src/content/blog/` is currently empty

Every page should demonstrate the workflow, show output examples, explain privacy and account/credit behavior accurately, and link to the relevant skill or composer flow. Always write **doodleai.art** in visible copy so the brand is not confused with doodleai.fun, InstaDoodle, or LazyAvatar.

## 2. Data provenance and methodology

### Live DataForSEO requests

Data was collected through the configured official DataForSEO MCP endpoint:

- **MCP endpoint:** `https://mcp.dataforseo.com/v3/mcp`
- **Keyword endpoint:** Google Ads Search Volume Live
- **Keyword suggestion endpoint:** Google Ads Keywords For Keywords Live
- **SERP endpoint:** Google Organic SERP Live Advanced
- **US location code:** `2840`
- **India location code:** `2356`
- **United Kingdom location code:** `2826`
- **Language:** English (`en`)
- **Keyword date range:** 2025-08-01 through 2026-07-31
- **SERP device:** mobile, iOS
- **SERP depth:** 10
- **AI Overview loading:** enabled for the SERP requests
- **PAA click depth:** 1
- **Research timestamp:** 2026-08-24

The Google Ads endpoint returns approximate monthly average search volume, competition, competition index, CPC, and monthly history. The latest monthly observation is not available for every row; when it is absent, the table shows an em dash. The trend column is calculated only from the months returned by DataForSEO and should be read directionally.

### Firecrawl and Grok limitations

- **2026-08-24:** no Firecrawl server and no unprimed Grok measurement were available.
- **2026-08-25:** Firecrawl scrapes of doodleai.art, `/skills/normal/`, live `llms.txt`, the sitemap, and [lazyavatar.com](https://lazyavatar.com) were added. Firecrawl web search for `best AI cartoon generator photo to cartoon 2026` ranked Canva, Adobe Firefly, Cartoonize AI, ImageToCartoon, BeFunky, Neural Frames, and Renderforest. Doodle AI was not in that set. A search for `Doodle AI doodleai.art` did not return doodleai.art in the first five results.
- **Grok:** still no unprimed mention baseline. See [aeo.md](./aeo.md) and [social.md](./social.md). Do not treat this product-aware session as organic visibility.

## 3. Priority keyword shortlist

Scoring is a planning score, not a DataForSEO metric:

- **Fit:** how closely the intent matches a Doodle AI capability.
- **Demand:** US monthly average search volume returned by DataForSEO.
- **SERP opportunity:** whether the query has attainable intent, visible question demand, or a content gap.
- **Priority:** High means build a landing page or core content asset first; Medium means support the hub or test after the first wave.

| Priority | Keyword | US volume | Competition | Index | CPC | Intent | Recommended asset |
|---|---|---:|---|---:|---:|---|---|
| High | photo to cartoon | 4,400 | Medium | 46 | $2.66 | Transform photo | Product hub |
| High | ai cartoon generator | 4,400 | Medium | 49 | $4.14 | Tool discovery | Product hub + AEO FAQ |
| High | profile picture cartoon | 1,900 | Low | 1 | $1.91 | Social avatar | Use-case landing page |
| High | cartoon pfp | 2,900 | Low | — | — | Social avatar | Support section/landing page |
| High | cartoonize image | 6,600 | Medium | 55 | $0.68 | Transform image | Supporting section; validate wording |
| High | cartoonize photo | 2,900 | Medium | 51 | $2.43 | Transform photo | Supporting page |
| High | turn photo into cartoon | 2,900 | High | 70 | $3.15 | How-to/tool | Tutorial + CTA |
| High | photo to drawing | 1,900 | Medium | 58 | $3.41 | Artistic transformation | Product/use-case page |
| Medium | photo to sketch | 2,400 | High | 69 | $2.63 | Artistic transformation | Product/use-case page |
| Medium | photo to sticker | 4,400 | High | 100 | $2.64 | Create sticker | Build only when feature is live |
| Medium | sticker from photo | 4,400 | High | 100 | $2.64 | Create sticker | Sticker page/supporting article |
| Medium | create sticker from photo | 2,400 | High | 100 | $3.91 | How-to/tool | How-to page |
| Medium | personalized stickers | 5,400 | High | 100 | $4.36 | Product/gift | Later commercial page |
| Medium | ai portrait generator | 2,900 | Medium | 38 | $4.67 | Portrait creation | Only if product expands |
| Medium | ai profile picture | 1,000 | Low | 32 | $3.94 | Avatar creation | Profile-picture landing page |
| Medium | ai sticker maker | 720 | High | 97 | $2.70 | Sticker creation | Later feature page |
| Medium | pet cartoon | 880 | Low | 11 | $0.58 | Pet transformation | Use-case landing page |
| Medium | couple avatar | 390 | Low | — | — | Couple transformation | Use-case landing page |
| Medium | avatar from photo | 260 | Low | 24 | $3.99 | Avatar creation | Supporting section |
| Medium | custom avatar maker | 260 | Low | 19 | $3.23 | Avatar creation | Supporting section |
| Medium | anime avatar | 1,300 | Low | — | — | Style/use case | Style page only if supported |
| Medium | whatsapp sticker maker | 720 | Low | 10 | $0.79 | Platform-specific sticker | Later distribution page |
| Low | ai pfp generator | 480 | Medium | 54 | $3.45 | Social avatar | Supporting term |
| Low | personalized photo gift | 720 | High | 100 | $3.06 | Gift intent | Gift page when real workflow exists |
| Low | family portrait cartoon | 320 | High | 100 | $0.60 | Family use case | Seasonal/use-case test |
| Low | custom cartoon portrait | 170 | High | 100 | $1.97 | Portrait creation | Supporting term |
| Low | ai doodle generator | 90 | Low | 33 | $6.36 | Exact product language | Brand/feature copy, not volume-led |
| Low | doodle profile picture | 20 | Low | — | — | Exact product language | Brand/feature copy |
| Low | doodle avatar | 10 | Low | — | — | Exact product language | Brand/feature copy |
| Low | doodle avatar maker | 10 | Low | — | — | Exact product language | Brand/feature copy |

## 4. Complete US keyword data

The following table contains every curated keyword returned by the live DataForSEO batch requests. `Latest` is the returned July 2026 value when available. `12-mo avg` is the arithmetic average of the monthly values returned by the API, not a separate DataForSEO field. A blank value means Google Ads returned no value for that field.

| Keyword | US avg volume | Competition | Index | CPC | Latest | 12-mo avg | Latest vs avg |
|---|---:|---|---:|---:|---:|---:|---:|
| ai headshot generator | 22,200 | Medium | 57 | $7.03 | — | 21,227 | — |
| couple cartoon | 9,900 | Low | 3 | $0.53 | 6,600 | 9,808 | -33% |
| cartoonify image | 6,600 | Medium | 55 | $0.68 | — | 6,182 | — |
| personalized stickers | 5,400 | High | 100 | $4.36 | 5,400 | 6,025 | -10% |
| photo to cartoon | 4,400 | Medium | 46 | $2.66 | 2,400 | 4,092 | -41% |
| ai cartoon generator | 4,400 | Medium | 49 | $4.14 | 1,900 | 4,142 | -54% |
| photo to sticker | 4,400 | High | 100 | $2.64 | 3,600 | 4,150 | -13% |
| sticker from photo | 4,400 | High | 100 | $2.64 | 3,600 | 4,150 | -13% |
| turn photo into cartoon | 2,900 | High | 70 | $3.15 | 1,600 | 2,725 | -41% |
| cartoonize photo | 2,900 | Medium | 51 | $2.43 | 1,600 | 2,542 | -37% |
| ai portrait generator | 2,900 | Medium | 38 | $4.67 | 1,900 | 2,683 | -29% |
| cartoon pfp | 2,900 | Low | — | — | — | 2,800 | — |
| photo to sketch | 2,400 | High | 69 | $2.63 | 1,600 | 2,308 | -31% |
| create sticker from photo | 2,400 | High | 100 | $3.91 | 1,900 | 2,483 | -23% |
| photo to drawing | 1,900 | Medium | 58 | $3.41 | 1,000 | 1,725 | -42% |
| custom sticker maker | 1,900 | High | 100 | $5.37 | 1,600 | 1,933 | -17% |
| profile picture cartoon | 1,900 | Low | 1 | $1.91 | — | 1,909 | — |
| anime avatar | 1,300 | Low | — | — | — | 1,382 | — |
| ai profile picture | 1,000 | Low | 32 | $3.94 | 880 | 1,072 | -18% |
| pet cartoon | 880 | Low | 11 | $0.58 | 590 | 928 | -36% |
| ai sticker maker | 720 | High | 97 | $2.70 | 590 | 782 | -25% |
| personalized photo gift | 720 | High | 100 | $3.06 | 390 | 659 | -41% |
| whatsapp sticker maker | 720 | Low | 10 | $0.79 | 720 | 748 | -4% |
| ai pfp generator | 480 | Medium | 54 | $3.45 | — | 499 | — |
| couple avatar | 390 | Low | — | — | 390 | 364 | +7% |
| family portrait cartoon | 320 | High | 100 | $0.60 | 140 | 327 | -57% |
| custom avatar maker | 260 | Low | 19 | $3.23 | 170 | 242 | -30% |
| avatar from photo | 260 | Low | 24 | $3.99 | 170 | 248 | -31% |
| cute avatar maker | 260 | Low | 1 | $0.97 | — | 284 | — |
| doodle pfp | 170 | Low | — | — | 110 | 170 | -35% |
| custom cartoon portrait | 170 | High | 100 | $1.97 | 70 | 158 | -56% |
| avatar for social media | 140 | Low | 6 | $3.24 | 110 | 148 | -26% |
| pet portrait ai | 110 | High | 90 | $0.98 | 70 | 112 | -38% |
| digital avatar maker | 110 | Low | 21 | $5.00 | 90 | 106 | -15% |
| instagram profile picture cartoon | 110 | Low | 1 | — | 110 | 112 | -2% |
| ai doodle generator | 90 | Low | 33 | $6.36 | 40 | 88 | -55% |
| cartoon portrait generator | 30 | High | 79 | $4.13 | 10 | 31 | -68% |
| doodle art generator | 30 | Medium | 42 | $4.01 | — | 26 | — |
| doodle profile picture | 20 | Low | — | — | 20 | 23 | -13% |
| turn selfie into cartoon | 20 | Medium | 51 | $3.08 | — | 18 | — |
| doodle avatar | 10 | Low | — | — | 10 | 14 | -29% |
| doodle avatar maker | 10 | Low | — | — | 10 | 11 | -9% |
| hand drawn avatar | 10 | Low | — | — | — | 10 | — |
| birthday avatar maker | 10 | Low | 29 | $4.25 | 10 | 10 | +0% |
| ai doodle avatar | — | — | — | — | — | — | — |
| ai gift from photo | — | — | — | — | — | — | — |

## 5. Location comparison

These values use the same live Google Ads Search Volume endpoint and keyword set. They are useful for choosing regional content and are not directly additive across countries.

| Keyword | US | India | United Kingdom |
|---|---:|---:|---:|
| ai headshot generator | 22,200 | 1,300 | 880 |
| couple cartoon | 9,900 | 6,600 | 720 |
| photo to cartoon | 4,400 | 2,400 | 1,300 |
| ai cartoon generator | 4,400 | 1,600 | 1,300 |
| photo to sticker | 4,400 | 18,100 | 1,000 |
| ai portrait generator | 2,900 | 9,900 | 480 |
| ai profile picture | 1,000 | 1,000 | 320 |
| pet cartoon | 880 | 170 | 260 |
| ai sticker maker | 720 | 260 | 70 |
| custom avatar maker | 260 | 50 | 30 |

### Regional decisions

- **US:** strongest launch market for `ai headshot generator`, `ai cartoon generator`, and `photo to cartoon`; use US English product pages and creator/social examples.
- **India:** `photo to sticker` (18,100) and `ai portrait generator` (9,900) materially outperform the US. If Doodle AI supports this market operationally, test India-specific pages and examples rather than simply translating the US page.
- **United Kingdom:** `photo to cartoon` and `ai cartoon generator` are both 1,300; use UK as a secondary English market after the US page is indexed.
- **Do not merge regional numbers into one global total.** Re-run with a deliberate country list and a consistent location policy before forecasting traffic.

## 6. Live SERP findings

### SERP snapshot configuration

Five mobile Google searches were queried in the US with depth 10 and asynchronous AI Overview loading enabled. The returned `item_types` show the result formats Doodle AI must compete with.

| Query | AI Overview | SERP formats observed | Leading organic domains |
|---|---|---|---|
| photo to cartoon | No captured AIO | Organic, app, PAA, people-also-search, images | imagetocartoon.com, Canva, Fotor, Google Play, cartoonize.net |
| ai cartoon generator | Yes | Organic, AI Overview, PAA, people-also-search | Adobe, imagetocartoon.com, Renderforest, Canva, InVideo |
| photo to sticker | No captured AIO | Organic, PAA, knowledge graph, images, perspectives | Jukebox Print, Walmart Photos, PhotoRoom, StickerYou, Apple Support |
| ai profile picture | No captured AIO | Organic, images, people-also-search, PAA | Canva, PFP Maker, Reddit, Pixelbin, Picofme |
| couple cartoon | No captured AIO | Organic, images, people-also-search, PAA | Bored Panda, Pinterest, Adobe Stock, Reddit, Pinterest |

### SERP format implications

- `photo to cartoon` is an image-heavy product SERP. Doodle AI needs crawlable output examples, descriptive image alt text, and a fast upload-first page—not only prose.
- `ai cartoon generator` is the best AEO target because an AI Overview was returned. Its overview explicitly separates photo-to-cartoon tools from text-to-video/cartoon tools, so Doodle AI should clearly state its input, output, styles, and workflow.
- `photo to sticker` has transactional and physical-print intent mixed together. A Doodle AI page should specify whether it creates a downloadable digital sticker, a sticker sheet, or a print-ready file; vague “sticker maker” wording will compete against the wrong results.
- `ai profile picture` has product pages, image results, Reddit discussion, and PAA. Original before/after examples, social-platform dimensions, and transparent privacy information can differentiate the page.
- `couple cartoon` is currently a discovery/inspiration query. A `couple avatar` page should use explicit “make an avatar from two photos” language and link from gifting/relationship content.

### People Also Ask opportunities

Use these as visible FAQ questions only when the page answers them directly:

**Photo to cartoon**

- How do I convert my photo to cartoon?
- How to do the ChatGPT cartoon trend?
- What is the best free app for converting pictures into cartoons?
- Is an AI cartoon generator free?
- What is the best free cartoon maker app?
- Can I cartoonize a photo on my phone?

**AI cartoon generator**

- Can ChatGPT create a cartoon?
- How do I create an AI cartoon of myself?
- Can AI turn my photo into a cartoon?
- Is there a free AI cartoon generator?
- How can I cartoonize a picture for free?

**Photo to sticker**

- How do I turn a photo into a sticker?
- How can I convert a picture into a sticker?
- How do I convert a photo to a sticker on iPhone?
- Is there a free sticker maker app for iPhone?

**AI profile picture**

- How do I get an AI profile picture?
- Can I use AI for my profile picture?
- What is the best AI to create a profile picture?
- Is there a free AI profile picture generator?

## 7. Competitor and content-pattern findings

### ImageToCartoon

Direct page retrieval showed a focused product page with:

- Immediate upload interface above the fold.
- Multiple styles including cartoon, anime, comic, clay, 3D, and a named “Doodle Art” style.
- Clear four-step workflow: upload, choose style, process, download.
- File-format and size guidance: JPG, PNG, WebP, up to 10 MB.
- Strong FAQ coverage for privacy, speed, mobile use, pets, group photos, commercial use, and whether software is required.
- A large style library and use-case language for avatars, profile pictures, pets, social posts, and gifts.

**Opportunity for Doodle AI:** compete on a distinct conversational creative-studio proposition: a user can describe the mood, attach a photo, choose a skill, and get a hand-drawn result. Do not imitate the competitor's generic “80 styles” claim unless Doodle AI actually offers that catalog.

### Canva

The retrieved page uses:

- Exact query language in the title/H1: “AI cartoon generator” and “photo-to-cartoon.”
- An upload CTA immediately after the introduction.
- A clear explanation of portrait, pet, family, social, classroom, and keepsake use cases.
- Related internal tools such as background remover, Magic Eraser, and AI photo editor.
- A visible “How to cartoonize a photo” section.
- FAQ content addressing the transformation process, watermark, and best-tool questions.

**Opportunity for Doodle AI:** publish a smaller, more focused page with stronger emotional and conversational differentiation, plus related links to avatar, collage, sticker, and gift skills.

### Fotor

The retrieved page uses:

- “Photo to Cartoon Converter” as the primary page title.
- Specific style and output claims: 54+ anime styles, cartoon avatars, cartoon portraits, anime characters, 3D cartoon, and high-resolution output.
- Before/after visual proof.
- Feature links to adjacent photo-to-anime, photo-to-sketch, and AI avatar tools.
- Privacy/security and high-quality-output reassurance.

**Opportunity for Doodle AI:** show real Doodle AI examples with a consistent hand-drawn signature, explain what the agent changes based on a prompt, and expose the full skill set as a linked topical cluster.

## 8. Recommended content architecture

### Core product pages

| URL | Primary target | Secondary targets | Search intent |
|---|---|---|---|
| `/photo-to-cartoon/` | photo to cartoon | cartoonize photo, turn photo into cartoon, cartoonify image | Upload and transform |
| `/ai-cartoon-generator/` | ai cartoon generator | ai cartoon generator free, AI cartoon from photo | Tool discovery + AEO |
| `/cartoon-profile-picture/` | profile picture cartoon | cartoon pfp, AI profile picture, AI PFP generator | Social identity |
| `/photo-to-sketch/` | photo to sketch | photo to drawing | Style transformation |
| `/photo-to-sticker/` | photo to sticker | sticker from photo, create sticker from photo | Digital sticker creation |
| `/pet-cartoon/` | pet cartoon | pet portrait AI | Pet use case |
| `/couple-avatar/` | couple avatar | couple cartoon picture, couple profile picture | Two-person creation |
| `/personalized-photo-gift/` | personalized photo gift | family portrait cartoon | Gift intent |

Only publish a page when the underlying Doodle AI skill and generated output are available. A roadmap card should not be presented as a functioning tool to search engines or users.

### Blog and guide pages

1. `/blog/how-to-turn-a-photo-into-a-cartoon/` — process guide, links to the product page.
2. `/blog/photo-to-cartoon-for-a-profile-picture/` — social-avatar use case.
3. `/blog/how-to-make-a-cartoon-pet-portrait/` — pet use case and examples.
4. `/blog/photo-to-sticker-digital-vs-print/` — clarify digital/print intent before the sticker feature launches.
5. `/blog/ai-cartoon-generator-prompts/` — prompt examples that produce consistent hand-drawn outputs.
6. `/blog/couple-avatar-ideas/` — inspiration that links to the two-photo workflow.

Each article needs one clear conversion path; avoid publishing generic AI news that does not lead to a Doodle AI capability.

## 9. Page brief for the first hub

### `/photo-to-cartoon/`

- **Title:** Photo to Cartoon Online — Create a Hand-Drawn Doodle | Doodle AI
- **Meta description:** Turn a photo into a playful hand-drawn cartoon avatar with Doodle AI. Upload a picture, describe the style, and create a shareable doodle.
- **H1:** Turn a Photo into a Hand-Drawn Cartoon
- **Opening answer:** Doodle AI turns a photo into a hand-drawn cartoon by combining an uploaded image with a natural-language style request. Upload a portrait, pet, or group photo, choose a doodle direction, and generate a result you can save or share.
- **Required sections:** how it works, supported input types, style examples, portrait/pet/group use cases, privacy and deletion explanation, credits explanation, FAQ, related skills.
- **Primary CTA:** Upload a photo and create a doodle.
- **Internal links:** `/skills`, `/about`, `/blog/how-to-turn-a-photo-into-a-cartoon/`, `/cartoon-profile-picture/`, `/pet-cartoon/`.
- **Evidence:** real Doodle AI before/after examples, not stock images or competitor screenshots.

## 10. Technical and on-page actions

### Existing strengths

The current repository already has:

- Astro server-rendered pages.
- `doodleai.art` as the canonical site base.
- Canonical, Open Graph, Twitter, viewport, and description handling in `AppLayout.astro`.
- JSON-LD for `WebSite` and `SoftwareApplication`.
- A dynamic sitemap and robots route.
- `public/llms.txt` with product facts and public pages.
- A homepage title that already targets “AI Doodle Avatar Generator,” **but `/` is not in the sitemap**. Search engines are directed at `/skills/` and the runnable skill pages.

### Fix or improve

1. Give each new public product page a unique title, meta description, canonical URL, OG image, and one descriptive H1.
2. Replace or support the generic homepage H1 “What should we doodle?” with nearby crawlable copy that states the product category: “Turn a Photo into a Hand-Drawn Doodle Avatar.” Preserve the conversational UX, but make the page topic explicit without hidden keyword text.
3. Add Article JSON-LD to blog posts with accurate `headline`, `datePublished`, `dateModified`, `author`, and image values.
4. Add `HowTo` JSON-LD only to pages that visibly show a real step-by-step process; do not add schema solely for rankings.
5. Add `FAQPage` JSON-LD only when the exact questions and answers are visible on the page and kept current.
6. Give every generated-example image meaningful alt text, dimensions, and stable URLs. Use decorative empty alt only for purely ornamental images.
7. Ensure API, chat, account, settings, and private workspaces remain noindex and absent from the sitemap.
8. Add breadcrumbs to deep product and article pages, with visible navigation and matching `BreadcrumbList` structured data.
9. Keep the primary content server-rendered. Do not put the only description, FAQ, or internal links behind a client-only fetch.
10. Make the upload CTA usable on mobile and ensure the page still has meaningful text and links before a user interacts.

## 11. 90-day execution plan

### Days 1–30: foundation

- Expand `/skills/normal/` and `/skills/` with crawlable product statements, examples, how-to steps, privacy/credit explanations, and FAQ sections. These pages already exist.
- Add `/photo-to-cartoon/` or `/cartoon-profile-picture/` only if the skill page cannot carry the query without becoming a junk drawer.
- Add breadcrumb and Article/FAQ/HowTo structured data where justified.
- Write the first real blog post; do not plan article URLs against an empty `src/content/blog/` directory.
- Submit the sitemap and verify rendered HTML, canonicals, robots, noindex behavior, and that live `llms.txt` matches the repo.

### Days 31–60: use-case expansion

- Publish `/pet-cartoon/`, `/couple-avatar/`, and `/photo-to-sketch/` if the corresponding output quality is acceptable.
- Add contextual internal links from the homepage, skills marketplace, blog, and related product pages.
- Test US landing-page titles and CTA language against sign-in and generation starts.
- Add a small image-search library with unique examples and descriptive filenames/alt text.

### Days 61–90: demand and AEO expansion

- Publish `/ai-cartoon-generator/` using the measured AI Overview questions.
- Launch `/photo-to-sticker/` only when the output format and download/share behavior are clear.
- Run a new DataForSEO SERP snapshot and compare AI Overview references, PAA, rankings, and competitor language.
- Start Grok/ChatGPT/Perplexity/Gemini visibility tracking using the AEO report's query set.
- Refresh pages where the latest monthly volume or SERP format changes materially.

## 12. Measurement plan

Track weekly by URL and keyword:

- Impressions, clicks, CTR, and average position from Search Console.
- Organic sessions and generation-start rate.
- Upload-start to successful-generation conversion.
- Sign-in conversion and credit purchase/usage where applicable.
- Indexed status and canonical selected by Google.
- Image search impressions for example images.
- AI Overview presence and cited domains for the target query set.
- Referring queries that contain “photo,” “cartoon,” “avatar,” “sticker,” “pet,” “couple,” or “doodle.”

A keyword is worth keeping when it has both search demand and product-qualified behavior. Do not optimise only for impressions if visitors cannot use the matching workflow.

## 13. Sources

- [DataForSEO MCP](https://dataforseo.com/model-context-protocol)
- [DataForSEO Google Ads Search Volume Live](https://docs.dataforseo.com/v3/keywords_data/google_ads/search_volume/live/)
- [DataForSEO Google Ads Keywords For Keywords Live](https://docs.dataforseo.com/v3/keywords_data/google_ads/keywords_for_keywords/live/)
- [DataForSEO Google Organic SERP Live Advanced](https://docs.dataforseo.com/v3/serp/google/organic/live/advanced/)
- [Doodle AI](https://doodleai.art)
- [Doodle AI skills](https://doodleai.art/skills/)
- [Doodle AI existing AI-readable product summary](https://doodleai.art/llms.txt)
- [ImageToCartoon](https://imagetocartoon.com/)
- [Canva AI cartoon generator](https://www.canva.com/features/photo-to-cartoon/)
- [Fotor photo-to-cartoon converter](https://www.fotor.com/features/photo-to-cartoon/)
- [Adobe Firefly AI cartoon generator](https://www.adobe.com/products/firefly/features/ai-cartoon-generator.html)
- [ChatGPT sticker announcement](https://x.com/ChatGPT/status/2091996384954069032)
- [LazyAvatar](https://lazyavatar.com)
- [Social knowledge-sharing report](./social.md)

## 14. Re-run instructions

Re-run the same research monthly with:

1. The same location/language parameters for comparability.
2. The same fixed keyword set plus a separate discovery set.
3. The same five SERP queries, mobile device, depth, and AI Overview setting.
4. A timestamp and DataForSEO task identifiers stored outside the public repository if raw audit logs are needed.
5. A separate competitor crawl tool such as Firecrawl once its MCP server is configured and approved.
