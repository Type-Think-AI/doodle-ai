# Doodle AI Editorial To-Do

**Prepared:** 2026-08-25
**Project:** [Doodle AI](https://doodleai.art)
**Audience for this plan:** writers, reviewers, and anyone publishing into `src/content/blog/`
**Source of truth:** [seo.md](./seo.md), [aeo.md](./aeo.md), [icp.md](./icp.md), [b2b.md](./b2b.md), [content-app-audit.md](./content-app-audit.md), and `src/content.config.ts`
**Status of the blog:** `src/content/blog/` contains one draft article: `visual-concept-sprint-for-animation-studios.md`. Treat it as a draft until deployment and human review.
**App audit:** The compatibility matrix in [content-app-audit.md](./content-app-audit.md) was checked against the source tree on 2026-08-25.

This is an editorial production plan, not a product announcement. Doodle AI is a conversational creative studio at **doodleai.art** that turns photos and ideas into playful hand-drawn doodle avatars, collages, die-cut sticker sheets, mood-caption collages, gift images, and surprise characters. Write that domain in visible copy so search engines and language models do not confuse the product with doodleai.fun, InstaDoodle, cartoonize.ai/doodle-art, or LazyAvatar.

## Current product facts vs. roadmap hypotheses

Every article must keep these layers separate. If a claim is not true in the live product, label it as a hypothesis, a planned experiment, or an unsupported use case. Never write as if it already ships.

**Current product facts (safe to describe as live):**

- Doodle AI is an Astro and Mastra chat-first creative application.
- Users can browse without an account. Sign-in is required for upload, generation, saving, and synced account work.
- Generation uses a server-owned PicX connection. Users do not paste a PicX key into Settings. Live copy must not tell them to.
- Generation is metered through an account credit ledger. New accounts receive **5 signup credits**. Every runnable skill costs **1 credit**. Credits are reserved before generation and refunded when a generation fails.
- Runnable skills: doodle avatar (`/skills/normal/`), collage (`/skills/collage/`), full-body collage (`/skills/full-body/`), surprise (`/skills/surprise/`), stickers as a square die-cut sticker *sheet* (`/skills/stickers/`), mood captions (`/skills/mood-captions/`), and gift (`/skills/gift/`).
- Emotional Modes and Seasonal Pack are catalog previews, not runnable skills.
- Signed-in users can save characters, @-mention them in chat, and save results to moodboards. Those surfaces are account-scoped, not public marketing pages.
- The public hub for search is `/skills/`, not the homepage. The homepage is intentionally omitted from the sitemap.
- Stripe checkout, paid credit packs, and subscriptions are planned. They are not implemented.
- The Better Auth organization layer, personal organizations, organization roles, active-organization sessions, organization-scoped threads/messages/references/moodboards, pooled credits, and organization limits are implemented in the backend/API foundation.

**Partial foundation — do not describe as finished user-facing workflows:**

- Team switcher or polished B2B workspace UI.
- Projects, assets, share links, batch jobs/items, and review states: schema/access-control foundations exist, but no dedicated end-to-end public routes were verified in the audited page tree.

**Not current capabilities. Do not describe them as available:**

- Transparent WhatsApp or iMessage sticker export. ChatGPT Images launched native chat-app stickers on 2026-08-24; Doodle AI does not.
- Guaranteed character continuity across generations. Saved organization-scoped references do not create a continuity guarantee.
- User-authored “fork as skill,” server-side conversation memory, voice input, and video.
- Commercial licenses, C2PA provenance, SSO, and physical merchandise fulfillment.
- Guaranteed commercial usage rights, deletion periods, print-ready dimensions, or photorealistic professional headshots.

**Entity rule:** Always write **doodleai.art**. LazyAvatar is a seed-based hand-drawn avatar API, not a photo-likeness studio. Do not treat `@doodleais` as an official Doodle AI account.

---

## 1. Editorial roadmap and article formats

Publish slowly. The SEO report’s best initial editorial bet is the existing skill catalog, then a small number of useful guides, not a large batch of thin keyword pages. AEO guidance is the same: two useful guides in weeks 2–4, then expand the page that earns qualified traffic and generation starts.

Aim for **one finished article every 7–10 days**, with a hard cap of **two published posts in any 14-day window** until the first six have real examples, citations, and a working CTA. Quality beats volume because Google and answer engines already have Canva, Fotor, ImageToCartoon, Adobe Firefly, Renderforest, Animaker, and Higgsfield on the `ai cartoon generator` surface.

### Format roster

Use a small set of formats so the blog is recognizable and each post has one job.

| Format | Purpose | Typical length target | Primary CTA | When to use |
|---|---|---|---|---|
| **How-to process guide** | Teach one transformation with a four-step workflow | 2,500–3,500 words | Open `/skills/normal/` or the matching runnable skill and create a doodle | Highest-intent consumer queries such as `turn photo into cartoon` |
| **Use-case explainer** | Map one audience and one outcome (PFP, pet, couple, gift) | 2,500–3,400 words | Upload a relevant photo and generate that use case | When search language matches a social or gifting job, not a generic tool query |
| **AEO answer article** | Put a direct definition in the first 40–60 words, then FAQ-style H2s | 2,500–3,200 words | Try Doodle AI at doodleai.art with a photo or idea | Queries with People Also Ask, AI Overviews, or assistant-style questions |
| **Intent-clarifier** | Separate digital vs print vs messaging, or photo-to-cartoon vs text-to-video | 2,500–3,200 words | Use the live skill that matches the clarified intent | When the SERP mixes incompatible jobs, especially stickers |
| **Prompt and example library** | Show specific prompts, inputs, and real outputs | 2,500–3,500 words | Copy a prompt, attach a photo, generate | After at least one process guide exists and original examples are ready |
| **B2B workflow brief** | Explain a production job studios or filmmakers already do | 2,500–4,000 words | Request a paid concept-sprint conversation, or try the relevant still-image skills | After consumer proof exists; never as a claim that video or batch already ships |
| **Original comparison or test** | Compare tools only after generating the same brief on each | 2,800–4,000 words | Generate the same job on Doodle AI | Only when Doodle AI is actually tested. No manufactured reviews. |

Do not invent extra formats such as news roundups, listicles of “80 AI tools,” or seasonal trend recaps unless they convert into a live Doodle AI skill.

### Cadence by cluster

1. **Weeks 1–6:** consumer how-tos and AEO answers that support `/skills/normal/`, cartoon profile pictures, pets, and the `ai cartoon generator` question set.
2. **Weeks 7–10:** stickers (die-cut sheets only), gifts, and couple avatars. Couple content must target “make a couple avatar from photos,” not the generic inspiration query `couple cartoon`.
3. **Weeks 11–16:** creator identity, mood-caption grids, and full-body action sheets as character exploration.
4. **After original consumer examples exist:** B2B studio, AI filmmaker, and production-workflow articles. Those pages are useless without real concept-sprint stills and an honest limitations note.

Keyword landing pages such as `/photo-to-cartoon/` or `/ai-cartoon-generator/` are product pages, not blog posts. Expand `/skills/normal/` before duplicating it. Blog posts should support those hubs with process, examples, and FAQs, then link to the runnable skill.

---

## 2. Topic backlog

The backlog below is the first wave. Every topic is specific to Doodle AI. None of them require claiming a roadmap feature is live.

Status key:

- **Not started** — no draft, no original examples.
- **Blocked** — waiting on real outputs, two-photo evidence, legal terms, or a live commercial path.
- **Drafting / In review / Scheduled / Published** — use these later; all rows start as **Not started**.

### Topic 1 — How to turn a photo into a cartoon with Doodle AI

- **Slug:** `how-to-turn-a-photo-into-a-cartoon`
- **Format:** How-to process guide
- **Cluster:** Consumer SEO
- **Intended reader:** A person with a selfie, portrait, or group photo who wants a hand-drawn cartoon, not a professional headshot.
- **Search intent:** Transactional how-to around `turn photo into cartoon` (2,900 US searches/month, high paid competition) and `photo to cartoon` (4,400). Supporting terms: `cartoonize photo`, `cartoonify image`.
- **CTA:** Upload a photo at doodleai.art and generate a doodle avatar on `/skills/normal/`. Secondary link to `/skills/` and `/about/`.
- **Evidence / data needed:** Live four-step workflow; photo requirement and 1:1 output facts from the skill page; 5 signup credits and 1-credit generations; sign-in requirement; original before/after from the Normal skill; DataForSEO volumes dated 2026-08-24; PAA questions from the `photo to cartoon` SERP.
- **Proposed visual:** Owned PicX-generated before/after pair (source photo with consent + doodle result), plus a simple four-step diagram: upload or describe, choose a doodle direction, generate, save or share. No competitor screenshots as proof.
- **Status:** Not started. First article in the sequence.

### Topic 2 — Cartoon profile pictures and cartoon PFPs from a photo

- **Slug:** `photo-to-cartoon-for-a-profile-picture`
- **Format:** Use-case explainer
- **Cluster:** Consumer SEO / social identity creators
- **Intended reader:** Social-first users, roughly 16–34, who want a distinctive Instagram, Discord, Reddit, or similar profile image without Photoshop.
- **Search intent:** Social identity. Primary: `profile picture cartoon` (1,900/month, competition index 1) and `cartoon pfp` (2,900). Support: `ai profile picture` (1,000), `ai pfp generator` (480).
- **CTA:** Create a square doodle avatar from a selfie and download it for a profile picture. Link to `/skills/normal/` until a dedicated `/cartoon-profile-picture/` page exists.
- **Evidence / data needed:** Square-output guidance; useful social sizes as *recommendations*, not invented product exports; face/identity consistency limitations; original PFP examples at feed-readable sizes; privacy and credit copy; PAA from the `ai profile picture` SERP.
- **Proposed visual:** A grid of three owned doodle PFPs from the same consented selfie (different moods), cropped to square, with captions naming the prompt. Optional overlay showing a profile-picture crop, clearly labelled as a crop guide rather than an in-product export preset.
- **Status:** Not started.

### Topic 3 — What an AI cartoon generator actually does (photo vs. text vs. video)

- **Slug:** `what-is-an-ai-cartoon-generator`
- **Format:** AEO answer article
- **Cluster:** AEO
- **Intended reader:** Someone comparing tools after seeing a Google AI Overview or asking ChatGPT/Grok/Perplexity/Gemini for a cartoon generator.
- **Search intent:** Tool discovery. `ai cartoon generator` (4,400/month, competition index 49) is the only measured query in the 2026-08-24 US mobile snapshot that returned an AI Overview. That overview named Adobe Firefly, Renderforest, Higgsfield AI, Canva, and Animaker. Doodle AI was not referenced.
- **CTA:** Try a photo-to-doodle generation at doodleai.art. State that Doodle AI is a conversational still-image studio, not a script-to-animation or text-to-video product.
- **Evidence / data needed:** The captured AI Overview language (photo-to-cartoon vs. text-to-image vs. script-to-animation vs. animated video); Doodle AI entity statement including doodleai.art; runnable skill roster; credits and privacy; last-updated date on changing product facts.
- **Proposed visual:** A comparison table in Markdown plus an owned diagram of Doodle AI’s actual path: browser chat turn → Mastra agent selects a skill → generation tool calls server-owned PicX → result returns to the browser. Do not illustrate video, lip-sync, or timeline editing.
- **Status:** Not started.

### Topic 4 — How to make a cartoon pet portrait

- **Slug:** `how-to-make-a-cartoon-pet-portrait`
- **Format:** How-to + use-case explainer
- **Cluster:** Pets
- **Intended reader:** Pet parents who search “pet cartoon,” “cartoon my dog,” or “pet portrait,” not “AI art.”
- **Search intent:** Emotional transformation and keepsake. `pet cartoon` is 880 US searches/month with a low competition index of 11. Do not chase `pet portrait ai` as the primary term unless output quality is proven.
- **CTA:** Upload a pet photo and generate a doodle character, gift image, or sticker-style keepsake. Link Normal, Gift, and Stickers as live options. Frame as a digital keepsake, not a shipped print.
- **Evidence / data needed:** Dog, cat, and at least one other pet example from real Doodle AI runs; photo-quality tips; honest failures for group pets, dark photos, and unusual poses; credit cost; no memorial promises the model cannot keep.
- **Proposed visual:** Owned before/after of a well-lit pet face, plus a “what not to upload” strip (dark, blurry, multi-pet jumble) generated or photographed with permission. Caption memorial language as a sensitive use case with quality limits, not a dedicated product.
- **Status:** Not started. Blocked until at least two real pet outputs exist.

### Topic 5 — Couple avatars from photos, not generic couple cartoons

- **Slug:** `couple-avatar-ideas`
- **Format:** Use-case explainer
- **Cluster:** Couples
- **Intended reader:** Couples or close friends who want a matching avatar, anniversary post, or shared chat image.
- **Search intent:** Creation, not inspiration. Target `couple avatar` (390/month, low paid competition). Do **not** try to win `couple cartoon` (9,900/month); the live SERP is Bored Panda, Pinterest, Adobe Stock, Reddit, and image boards.
- **CTA:** Make a shared doodle from the photos you have. Explain honestly whether two source images are supported in one generation. If they are not, describe a workable single-image or sequential workflow. Do not invent multi-image support.
- **Evidence / data needed:** Live test of couple photos through Normal, Collage, Full-body, and Gift; note on face and relationship-composition limits; occasion language (anniversary, matching PFP) without implying a physical gift.
- **Proposed visual:** One owned couple doodle from a consented photo, plus a collage example if the Collage skill holds two people. If two-image upload fails, a labelled diagram of the current workaround.
- **Status:** Not started. Blocked on a documented two-person test.

### Topic 6 — Photo to sticker: die-cut sheets vs. print vs. chat-app stickers

- **Slug:** `photo-to-sticker-digital-vs-print`
- **Format:** Intent-clarifier
- **Cluster:** Stickers
- **Intended reader:** Someone who searched `photo to sticker` (4,400/month, competition index 100) and might mean a print shop, an iPhone utility, ChatGPT-style messaging stickers, or a digital sheet.
- **Search intent:** Mixed transactional. Live SERP leaders include Jukebox Print, Walmart Photos, PhotoRoom, StickerYou, and Apple Support. ChatGPT Images launched transparent iMessage/WhatsApp stickers on 2026-08-24.
- **CTA:** Generate a square die-cut sticker *sheet* with `/skills/stickers/`. Do not send readers to a fictional `/photo-to-sticker/` page that implies chat-app export.
- **Evidence / data needed:** Actual Sticker Pack output (square sheet, not a transparent PNG pack); side-by-side definition of digital sheet vs. print-on-demand vs. messaging sticker; India volume note (`photo to sticker` 18,100) as research context, not a localized page promise.
- **Proposed visual:** Owned sticker-sheet result with a caption that says “die-cut sticker sheet image, not a WhatsApp or iMessage pack.” Optional annotated screenshot of the skill page. Embed the ChatGPT sticker announcement on X as a *reference*, not as a copied asset.
- **Status:** Not started.

### Topic 7 — Personalized doodle gifts from a photo

- **Slug:** `personalized-doodle-gift-from-a-photo`
- **Format:** Use-case explainer
- **Cluster:** Gifts
- **Intended reader:** A gift buyer with a deadline who needs a downloadable personal visual, not a designer and not a print shop.
- **Search intent:** Occasion and personalization. `personalized photo gift` is 720 US searches/month with high commercial competition. `ai gift from photo` returned no Google Ads volume; keep it as product language, not demand proof.
- **CTA:** Start from one meaningful photo and generate a gift image with `/skills/gift/`. State file and resolution only if verified. Do not sell physical fulfillment.
- **Evidence / data needed:** Real Gift-skill outputs for birthday and thank-you; download/share behavior; privacy of someone else’s photo; reminder that Stripe packs are planned, not live; 1-credit cost.
- **Proposed visual:** Owned gift-image example with occasion caption (“digital birthday doodle, not a shipped print”) and a short checklist graphic: photo permission, occasion, prompt, generate, download.
- **Status:** Not started.

### Topic 8 — Prompt examples that keep a hand-drawn doodle look

- **Slug:** `ai-cartoon-generator-prompts`
- **Format:** Prompt and example library
- **Cluster:** Consumer SEO + AEO + creators
- **Intended reader:** A user who already understands photo-to-cartoon and wants better control over mood, clothing, and composition.
- **Search intent:** Informational-to-transactional. Supports `ai cartoon generator` and “how do I create an AI cartoon of myself?” Do not promise 80 styles. Doodle AI competes on a conversational hand-drawn signature, not a fake style catalog.
- **CTA:** Copy one prompt, attach a photo, generate with the named skill.
- **Evidence / data needed:** At least eight real prompt/output pairs from runnable skills; what the agent actually changes; failure cases (over-detailed prompts, no photo when the skill needs one, identity drift).
- **Proposed visual:** Prompt-in, image-out cards using owned generations. On social, this matches the live X pattern of “prompt in thread” plus the skill name.
- **Status:** Not started. Schedule after Topics 1–3 so examples are not the first indexed posts.

### Topic 9 — Mood-caption collages and shareable social grids

- **Slug:** `mood-caption-collage-from-a-photo`
- **Format:** Use-case explainer
- **Cluster:** Creators / social identity
- **Intended reader:** People who want a one-photo, several-vibe grid for a post, story, or chat, matching how people already share on X.
- **Search intent:** Product-led, lower keyword volume. Supports avatar and social-identity clusters rather than a head term. Useful internally because Mood Captions is runnable.
- **CTA:** Generate a mood-caption collage with `/skills/mood-captions/`. Invite a second generation in a different mood. Do not imply batch variants.
- **Evidence / data needed:** Two or three owned collage outputs; text-quality limits on captions; 3x2 collage vs. mood-caption vs. full-body distinctions; credit cost per generation.
- **Proposed visual:** One owned mood-caption collage, uncropped, with alt text that names the moods shown. Optional annotated crop for Instagram, labelled as a publishing suggestion.
- **Status:** Not started.

### Topic 10 — Building a recognizable doodle character for a creator page

- **Slug:** `doodle-character-for-creators`
- **Format:** Use-case explainer
- **Cluster:** Creators / micro-creators and small businesses
- **Intended reader:** Newsletter writers, streamers, community mods, and personal-brand accounts who need a recurring visual, not a one-off filter.
- **Search intent:** Mixed. Supporting terms include `custom avatar maker` and `avatar from photo` (both 260/month). The job is “repeatable character,” which the product only partly supports today via saved characters and @-mentions for signed-in users.
- **CTA:** Create a doodle avatar, save the character in-account, and reuse it in chat. State that batch poses, commercial licenses, and subscriptions are not live.
- **Evidence / data needed:** Saved-character behavior as implemented; consistency limits across generations; sticker-sheet and collage as community assets; Adobe 2025 creator survey figures only as market context (86% of surveyed creators use creative generative AI), not as Doodle AI metrics.
- **Proposed visual:** Owned “same person, several moods” set *if* a public figure consents, or a staff/example character with that limitation in the caption. Do not fake consistency the model does not have.
- **Status:** Not started.

### Topic 11 — Concept sprints for boutique animation studios

- **Slug:** `doodle-concept-sprint-for-animation-studios`
- **Format:** B2B workflow brief
- **Cluster:** B2B studios
- **Intended reader:** Founder, creative director, or producer at a 2–20 person animation or explainer studio who needs client-ready concepts before staffing full production.
- **Search intent:** Niche commercial. Candidate product URLs in the B2B report (`/for-animation-studios/`, `/character-style-sheet/`) should wait until examples exist. The article can precede those pages if it uses real stills and a manual pilot offer.
- **CTA:** Start with Collage and Full-body on a non-confidential reference, or request a paid concept-sprint conversation. Pilot pricing in [b2b.md](./b2b.md) (`$149–$299`) is a hypothesis. Stripe is not live; do not put a checkout button on the article.
- **Evidence / data needed:** One sample brief; character sheet and six-panel action/expression exploration from live skills; time-to-first-review from a manual run; Grand View Research generative-AI-in-animation figures only as directional market context (`$916.6M` in 2025, projected `$13.39B` by 2033), never as a Doodle AI forecast.
- **Proposed visual:** Owned contact-sheet of close-up collage + full-body action collage from one approved reference. Diagram of the *manual* sprint: brief → reference → generate → human select → export package. Label workspace UI, batch, and review portal as partial foundations with no verified end-to-end public routes/UI.
- **Status:** Draft exists at `src/content/blog/visual-concept-sprint-for-animation-studios.md`; update its claims using [content-app-audit.md](./content-app-audit.md) before publishing.

### Topic 12 — Pre-production stills for AI filmmakers

- **Slug:** `ai-filmmaker-pre-production-stills`
- **Format:** B2B workflow brief
- **Cluster:** AI filmmakers
- **Intended reader:** AI filmmaker, director, or virtual-production lead who needs character directions, shot ideation, and mood boards before choosing a video approach.
- **Search intent:** Workflow education. Sell pre-production stills. Do not position Doodle AI as a Sora replacement. OpenAI marks the Sora 2 Videos API as deprecated with a shutdown date of 2026-09-24; the consumer Sora app already shut down on 2026-04-26.
- **CTA:** Explore characters, poses, and shot ideas as stills with Full-body, Collage, and Surprise. Keep video generation, animatics, and shot lists labelled as later production-layer ideas.
- **Evidence / data needed:** Side-by-side stills from one reference at different poses; Wyzowl’s published statistic that 91% of businesses use video as a marketing tool, used only to explain why teams already need pre-production assets; honest gap list (no shot lists, no reference locking as a B2B object, no video adapter).
- **Proposed visual:** Owned six-frame “pose exploration” board from Full-body. Do not mock a timeline editor. If citing Grok Imagine UGC clips (~`$0.04` per clip in one 2026-08-24 X post), embed the post as a reference and say that is a different job.
- **Status:** Not started.

### Topic 13 — From brief and reference to a reviewable visual direction

- **Slug:** `brief-to-reviewable-visual-direction`
- **Format:** Production-workflow guide
- **Cluster:** Production workflows / agencies and brand teams
- **Intended reader:** Agency producer, art director, or brand content lead who already reviews concepts in Figma, Frame.io, Notion, or Slack.
- **Search intent:** Commercial workflow. Complements proposed later pages such as `/for-creative-agencies/` and `/ai-storyboard-concepts/`. The article must describe today’s manual path, not a studio workspace that does not exist.
- **CTA:** Run a bounded still-image exploration on doodleai.art, export selected frames, and review them in the team’s existing tool. Offer a Campaign Visual Pack conversation only as a service experiment (`$399–$999` is a hypothesis).
- **Evidence / data needed:** Asset metadata a producer actually needs (prompt, skill, source reference, timestamp, credit cost); current ledger behavior (reservation and refund); Adobe Firefly shared-credit and Frame.io review capabilities as *competitor/adjacent expectations*, not Doodle AI features; C2PA as a roadmap-level provenance topic, not a live badge.
- **Proposed visual:** A swimlane diagram: Client brief → approved reference → Doodle AI skill run → human cull → existing review tool. Use owned example assets in the “cull” column.
- **Status:** Not started.

### Topic 14 — Photo to drawing vs. photo to doodle

- **Slug:** `photo-to-drawing-vs-hand-drawn-doodle`
- **Format:** Intent-clarifier + how-to
- **Cluster:** Consumer SEO (style)
- **Intended reader:** Users searching `photo to drawing` (1,900/month) or `photo to sketch` (2,400/month) who may want pencil sketch, ink drawing, or a playful doodle.
- **Search intent:** Artistic transformation. Medium/high competition. Publish only if Normal (and any live sketch-like look) can honestly satisfy part of the query. A `/photo-to-sketch/` product page is a later hub, not a prerequisite, and must not launch on a roadmap card.
- **CTA:** Generate a hand-drawn doodle from a photo. Explain that Doodle AI’s signature is a playful doodle, not a photoreal pencil filter and not an anime catalog unless that look is actually produced.
- **Evidence / data needed:** Side-by-side owned outputs if multiple looks are real; otherwise one doodle result and a written distinction from sketch/anime tools; file-type guidance only if verified.
- **Proposed visual:** Owned doodle vs. a clearly captioned “not this” description of photoreal sketch tools. Do not scrape competitor results into the article body.
- **Status:** Not started. Lower priority than Topics 1–6.

### Topic 15 — Uploading a face or pet photo: credits, privacy, and what is live

- **Slug:** `doodle-ai-credits-privacy-and-photo-uploads`
- **Format:** AEO answer article
- **Cluster:** AEO / trust
- **Intended reader:** Anyone about to upload a likeness who needs account, credit, and provider-boundary facts before signing in.
- **Search intent:** Trust and qualification. Directly supports assistant prompts such as “Is Doodle AI free?” and “Is Doodle AI safe for uploading personal photos?”
- **CTA:** Browse `/skills/` freely, then sign in when ready to generate. Repeat: 5 signup credits, 1 credit per runnable skill, refunds on failure, server-owned PicX, no client-side provider key.
- **Evidence / data needed:** Implementation-backed account rules; no invented deletion window or commercial license; list of runnable vs. coming-soon skills; date stamp.
- **Proposed visual:** Simple table of browse vs. signed-in capabilities, plus a diagram of “your browser / Doodle AI server / PicX, credentials stay server-side.” No stock “lock icon” photography.
- **Status:** Not started. Strong supporting article after Topic 1.

That is fifteen specific topics. The first twelve already cover consumer SEO, AEO, B2B studios, AI filmmakers, creators, pets, couples, stickers, gifts, and production workflows. Topics 14 and 15 fill style-intent and trust gaps that the SEO and AEO reports both flagged.

---

## 3. Topic briefing rules

Every row in the backlog, and every future topic, must be specified with all six fields before drafting starts:

1. **Intended reader** — one person, one job to be done. Use ICP segments (social identity creator, pet parent, couple/friend group, gift buyer, micro-creator, studio/filmmaker/producer). Do not write “anyone who likes AI.”
2. **Search intent** — the query family, volume/competition from the dated DataForSEO pull when relevant, and the SERP format (product, PAA, AI Overview, inspiration images). Re-run numbers before citing them as current.
3. **CTA** — one conversion path to a *runnable* skill or to a clearly labelled conversation for a paid pilot. No second CTA that contradicts the first.
4. **Evidence / data needed** — original generations, product facts, and named third-party sources. If the evidence is missing, the status is Blocked.
5. **Proposed image / diagram / example** — owned PicX output, a process diagram, or a labelled table. Decide this before writing so the draft is not 2,500 words of unillustrated advice.
6. **Status** — Not started, Blocked, Drafting, In review, Scheduled, or Published.

Do not add a topic that cannot fill those fields. Do not publish a URL from [seo.md](./seo.md) against an empty `src/content/blog/` directory.

---

## 4. Non-negotiable writing rules

These rules apply to every article, including drafts that never publish.

### Length and substance

- **Minimum 2,500 words** of original body copy. Frontmatter, alt text, and reference lists count only if they are part of the Markdown file, but padding, keyword stuffing, and repeated boilerplate do not count toward the spirit of the minimum.
- Write for a human who will actually generate something. Prefer specific nouns: doodleai.art, PicX, Mastra, `/skills/stickers/`, 5 signup credits, 1 credit per generation.
- One primary intent per article. Adjacent skills belong in a short “related” section with links, not as a second article glued underneath.

### Voice

- Human, specific, and slightly conversational — closer to the product’s “What should we doodle?” tone than to affiliate-review English.
- Prefer “Doodle AI does X” over “revolutionize your creativity.”
- Put the direct answer in the first 40–60 words on AEO-style pieces. Use question-like H2s when they match real PAA language.
- US English for the first wave. Do not merge US, India, and UK volumes into one global total.

### Sources and facts

- Cite **real, named sources** with links. Starting set from the research docs:
  - [DataForSEO Google Ads Search Volume Live](https://docs.dataforseo.com/v3/keywords_data/google_ads/search_volume/live/)
  - [DataForSEO Google Organic SERP Live Advanced](https://docs.dataforseo.com/v3/serp/google/organic/live/advanced/)
  - [Doodle AI](https://doodleai.art), [skills](https://doodleai.art/skills/), [llms.txt](https://doodleai.art/llms.txt)
  - [ImageToCartoon](https://imagetocartoon.com/), [Canva photo-to-cartoon](https://www.canva.com/features/photo-to-cartoon/), [Fotor](https://www.fotor.com/features/photo-to-cartoon/), [Adobe Firefly cartoon generator](https://www.adobe.com/products/firefly/features/ai-cartoon-generator.html)
  - [ChatGPT sticker announcement](https://x.com/ChatGPT/status/2091996384954069032)
  - [LazyAvatar](https://lazyavatar.com)
  - [Grand View Research — Generative AI in Animation](https://www.grandviewresearch.com/industry-analysis/generative-ai-animation-market-report)
  - [Wyzowl video marketing statistics](https://wyzowl.com/video-marketing-statistics/)
  - [Adobe 2025 creator survey](https://news.adobe.com/news/2025/10/adobe-max-2025-creators-survey)
  - [Runway pricing](https://runway.com/pricing), [Adobe shared generative credit pools](https://helpx.adobe.com/enterprise/using/generative-credit-pool.html), [Frame.io](https://frame.io/pricing)
  - [C2PA explainer](https://c2pa.org/specifications/specifications/2.2/explainer/Explainer.html)
  - [OpenAI Sora video generation docs](https://developers.openai.com/api/docs/guides/video-generation/)
- Include the **as-of date** for product facts and for search/AI Overview snapshots.
- Distinguish **current product facts** from **roadmap hypotheses** in the body, not only in a footnote. Useful labels: “Available now,” “Not in the current product,” “Commercial hypothesis.”
- Never invent deletion periods, commercial rights, variant counts, batch SLAs, or print dimensions.
- Never create fake reviews, fake community posts, hidden keyword FAQs, or mass-generated near-duplicates.

### Markdown only

- Author in **Markdown** (`.md`). MDX is technically allowed by `src/content.config.ts`, but the default for this program is Markdown so posts stay portable and reviewable in git.
- Do not paste the article into Google Docs as the source of truth.
- Do not ship PDF, HTML-in-Markdown soup, or Word files as the blog post.
- Use descriptive `#` / `##` / `###` headings, ordered lists for procedures, tables for comparisons, and visible FAQs only when the same questions and answers appear in the rendered page.
- Frontmatter must match the Astro schema in `src/content.config.ts`:

```yaml
---
title: "Plain-language title"
description: "One or two sentences. Include doodleai.art or the specific outcome."
pubDate: 2026-09-15
updatedDate: 2026-09-15
heroImage: "/blog/how-to-turn-a-photo-into-a-cartoon/hero.png"
---
```

- `title` and `description` are required strings. `pubDate` is required and coerced to a Date. `updatedDate` and `heroImage` are optional. If product facts change, set `updatedDate`.
- Filenames live under `src/content/blog/` and should match the slug, for example `src/content/blog/how-to-turn-a-photo-into-a-cartoon.md`. Nested folders are allowed by the glob `**/*.{md,mdx}`. Prefer a flat slug unless a series is real.

### On-page SEO and AEO hygiene (article-level)

- One H1, equal to or very close to `title`.
- Canonical, Open Graph, and Article JSON-LD are site responsibilities, but the Markdown must supply an accurate headline, dates, description, and image path so those tags are not lies.
- Add `FAQPage` or `HowTo` structured data only if the same steps or Q&A are visible. Do not hide a keyword FAQ for crawlers.
- Link to the matching runnable skill, `/skills/`, `/about/`, and at most two related posts.
- Always include **doodleai.art** in visible copy.
- Keep private chat, account, API, and unpublished roadmap routes out of the article and out of any suggested `llms.txt` additions.

---

## 5. Image and media policy

Articles will not rank or get quoted without original visual proof. The `photo to cartoon` SERP is image-heavy. Empty hero slots and stock “AI brain” illustrations are not acceptable.

### Owned PicX-generated images (preferred)

- Generate examples through the real Doodle AI path (server-owned PicX).
- Use consented photos: staff, friends, or users who agreed to marketing use. Do not publish a customer likeness from a private moodboard without permission.
- Save stable files under a public, crawlable path such as `public/blog/<slug>/`. Filenames should describe the content: `doodleai-art-pet-cartoon-before-after.png`, not `img-02.png`.
- Show before/after only when the “before” is a photo you have rights to and the “after” is a Doodle AI result. Caption both.
- Prefer the actual aspect ratio of the skill (avatar 1:1, sticker sheet square, collages as produced). Do not stretch outputs.

### Licensed external images

- Allowed only when an owned generation cannot illustrate a factual point (for example, a diagram of a third-party review workflow).
- Require a license that allows web publication on doodleai.art: original creation, properly licensed stock, or a source with an explicit reuse grant.
- Record creator, license, source URL, and download date next to the file.
- Do not hotlink. Do not use random Google Images results. Do not copy ImageToCartoon, Canva, Fotor, Adobe, LazyAvatar, or ChatGPT UI as if it were Doodle AI.

### X and social posts

- Treat X/social posts as **references**, not as copied assets.
- Embed or link the original post (for example the ChatGPT sticker announcement) when you need to cite a launch or a prompt-sharing behavior.
- Do not screenshot-and-crop someone else’s generations into the hero image. Do not download another account’s doodle PFP and present it as a Doodle AI sample.
- If quoting a prompt from X, attribute the account and date. Live patterns to learn from, not to pirate: “prompt in thread,” one-photo-to-many-vibe grids, and honest sticker-sheet captions.
- There is no official doodleai.art X account yet. Do not cite `@doodleais`.

### Alt text, captions, and attribution

- Every content image needs descriptive alt text that names the subject, the medium (hand-drawn doodle, collage, sticker sheet), and whether it is a Doodle AI output.
- Decorative dividers may use empty alt; example outputs may not.
- Captions should include: what the image is, which skill produced it (if any), and a rights/attribution line.
- Example caption: “Doodle avatar generated with the Normal skill on doodleai.art, 2026-08-25. Source photo used with permission.”
- Example alt: “Hand-drawn doodle avatar of a smiling woman in a yellow hoodie, generated by Doodle AI from a portrait photo.”
- For diagrams, alt text should state the process being shown, including that batch/video steps are hypothetical when they are.
- Add `ImageObject`-quality metadata only for real, stable URLs. Do not point schema at missing files.

### What not to illustrate

- Upcoming Emotional Modes or Seasonal Pack as if they generate today.
- Transparent chat-app sticker packs.
- Checkout, subscription, or credit-pack screens that do not exist.
- Broadcast animation pipelines, Sora-style video, or Frame.io-like review portals drawn as product UI.

---

## 6. Repeatable Grok writing and review workflow

Use Grok as a research-and-draft partner, not as an unsupervised publisher. This session has product context, so it is **not** an unprimed visibility measurement. Keep visibility tests in a fresh conversation with no brand hint, as specified in [aeo.md](./aeo.md).

### Stage A — Brief

1. Pick one backlog topic whose status is Not started and whose evidence is actually available.
2. Paste into Grok: the topic’s six fields, the current product facts block from this file, and the relevant sections of seo/aeo/icp/b2b.
3. Ask Grok for a 300–500 word outline with H2s, the first-paragraph answer, the CTA, the FAQ list (only real PAA or buyer questions), and a list of evidence still missing.
4. Human edits the outline. If evidence is missing, set status to Blocked and stop.

### Stage B — Evidence pack

5. Generate the owned images through Doodle AI. Save files and write alt text/captions.
6. Re-check live skill copy, credits, and runnable vs. coming-soon lists against the site and `llms.txt`.
7. Re-check any search volume or SERP claim you will cite. If you cannot re-query DataForSEO, cite the 2026-08-24 snapshot as historical.
8. Collect source URLs. No unsourced market numbers.

### Stage C — Draft

9. Prompt Grok to write the full Markdown article, including frontmatter that matches `src/content.config.ts`.
10. Constraints to put in the prompt every time:
    - at least 2,500 words
    - Markdown only
    - doodleai.art in the opening
    - current facts vs. hypotheses labelled
    - no WhatsApp/iMessage sticker export
    - no Stripe/subscription as live
    - no video
    - no fake reviews
    - CTA to a runnable skill
    - image placeholders with final alt text
11. If the draft is under 2,500 words, expand with specific workflow detail, limitations, examples, and cited comparisons — not with synonym loops.

### Stage D — Review (required, second Grok pass + human)

Run a review prompt that only accepts Pass / Fail on each item:

- [ ] Opening answers the user intent in 40–60 words
- [ ] Reader, intent, and CTA match the brief
- [ ] ≥2,500 words of specific, human prose
- [ ] All product claims are live or explicitly labelled as not live
- [ ] Credits: 5 signup, 1 per generation, refund on failure
- [ ] Stickers described as die-cut sheets
- [ ] Emotional Modes / Seasonal Pack not described as runnable
- [ ] Domain doodleai.art present; no entity collision
- [ ] Named sources with links and dates
- [ ] Images have alt, caption, rights line
- [ ] Frontmatter valid
- [ ] Internal links only to public, indexable URLs
- [ ] No invented license, deletion window, variants, batch, or physical goods
- [ ] One primary CTA

A human editor must still read the piece against the live site. Grok cannot see unpublished routes or private chat output unless you paste them.

### Stage E — Assistants and SEO sanity (optional, not a publish gate)

12. Skim the draft as if you were writing an AI Overview: would the first paragraph be quotable and accurate?
13. Do **not** treat a product-aware Grok chat as a mention-rate data point. Unprimed prompts live in [aeo.md](./aeo.md) section 8.

### Stage F — Hand-off

14. Save the file under `src/content/blog/<slug>.md`.
15. Put images in the public path referenced by `heroImage` and in-body Markdown.
16. Move status to In review, then Scheduled once the publishing checklist passes.

Prompt skeleton (adapt, do not blindly rerun):

```text
You are drafting a Doodle AI article for doodleai.art.
Use only current product facts unless labelled "Not in the current product."
Runnable skills: normal, collage, full-body, surprise, stickers (die-cut sheet), mood captions, gift.
Not runnable: Emotional Modes, Seasonal Pack, video, WhatsApp/iMessage stickers, Stripe, batch variants.
Minimum 2,500 words. Markdown with Astro blog frontmatter (title, description, pubDate, optional updatedDate, optional heroImage).
Reader: [persona]. Intent: [query]. CTA: [runnable URL].
Cite these sources: [URLs]. Include owned-image placeholders with alt text.
```

---

## 7. Publishing checklist for Astro content collections

The blog collection is defined in `src/content.config.ts` as a glob over `./src/content/blog` for `**/*.{md,mdx}`, with a Zod schema of `title`, `description`, `pubDate`, optional `updatedDate`, and optional `heroImage`. If any required field is missing or the date cannot be coerced, the collection build fails.

### Before merge

- [ ] File is `src/content/blog/<slug>.md` (Markdown unless there is a documented reason for MDX).
- [ ] Frontmatter `title` is unique, human, and matches the H1.
- [ ] Frontmatter `description` is one or two sentences, no clickbait, includes the outcome or doodleai.art.
- [ ] `pubDate` is a real calendar date, not a placeholder.
- [ ] `updatedDate` set if the post revises product facts.
- [ ] `heroImage` path exists in `public/` (or the resolved asset path the site actually uses). Broken heroes fail the quality bar even if they do not fail Zod.
- [ ] Body ≥ 2,500 words and uses only Markdown constructs the renderer supports.
- [ ] All images resolve locally; no hotlinks to private chat blobs.
- [ ] Alt text and captions present.
- [ ] CTA points to a live public page: a runnable `/skills/.../` route, `/skills/`, `/about/`, or a later public hub that actually exists.
- [ ] No links to `/api/`, account, settings, private chat, or unpublished roadmap URLs.
- [ ] Claims match live `llms.txt` and skill pages. If they disagree, fix the article or file a product-copy bug; do not ship the contradiction.
- [ ] FAQ/HowTo blocks are visible in the Markdown, not commented out.
- [ ] Sources listed at the bottom with links.
- [ ] “Available now” vs. “Not in the current product” still accurate on the day of merge.

### After the site build

- [ ] Local `astro` build succeeds; the post appears in the blog collection.
- [ ] Rendered HTML contains the opening answer, headings, and CTA without a client-only fetch.
- [ ] Canonical URL is the public article URL on doodleai.art.
- [ ] Page is indexable and will appear in the sitemap once deployed. Confirm the sitemap route includes blog posts after the first publish (the SEO report notes the homepage is omitted on purpose; articles should not be).
- [ ] `robots` does not noindex the article.
- [ ] Open Graph title/description/image match the post.
- [ ] Article JSON-LD, if the layout emits it, uses this post’s `title`, `pubDate`, `updatedDate`, and hero image. Do not emit FAQ/HowTo schema unless those sections render.
- [ ] Internal links from `/skills/normal/` or other hubs are added only where they help a user continue. Do not spam every skill page on day one.
- [ ] After deploy, fetch the live URL and confirm `llms.txt` is updated *only if* the article is a public guide worth listing. Do not list drafts.

### Measurement after publish (weekly)

- Search Console: impressions, clicks, CTR, average position for the target queries.
- Organic sessions and generation-start rate from the article.
- Whether Google selected the canonical you intended.
- Image-search impressions on owned examples.
- For AEO targets: DataForSEO AI Overview presence and cited domains; separately, unprimed assistant prompts from [aeo.md](./aeo.md).
- Keep the article if it creates qualified generation starts. Do not keep it only because it collects impressions.

---

## Suggested first six articles

Ship in this order. It follows the SEO report’s blog list, the AEO instruction to expand photo-to-doodle answers first, and the ICP order (social identity → pets → stickers/gifts/couples).

| Order | Article | Why this position | Primary CTA |
|---|---|---|---|
| 1 | How to turn a photo into a cartoon with Doodle AI | Highest-fit how-to; supports `photo to cartoon` / `turn photo into cartoon`; gives `/skills/normal/` the long-form evidence it still lacks | Generate on `/skills/normal/` |
| 2 | Cartoon profile pictures and cartoon PFPs from a photo | Low-competition social identity terms (`profile picture cartoon`, `cartoon pfp`); primary ICP | Square doodle avatar from a selfie |
| 3 | How to make a cartoon pet portrait | Strong emotional ICP; 880/month at low competition; needs real pet stills | Pet photo into Normal, Gift, or Stickers |
| 4 | What an AI cartoon generator actually does | Only measured AI Overview query; entity and input/output clarification; do not wait for a duplicate `/ai-cartoon-generator/` product page before the explainer exists | Photo-to-doodle at doodleai.art |
| 5 | Photo to sticker: die-cut sheets vs. print vs. chat-app stickers | High-volume, high-confusion SERP; Sticker Pack is already runnable; must beat ChatGPT messaging intent with honesty | `/skills/stickers/` sheet |
| 6 | Couple avatars from photos | Smaller volume, high occasion value; must wait until the two-person workflow is tested and described accurately | Shared doodle via the documented live path |

Article 1 can start as soon as one consented before/after exists. Articles 3 and 6 stay blocked without real pet and couple outputs. Do not skip ahead to B2B (Topics 11–13) until these six have original images.

After the first six, the default next wave is Topic 7 (gifts), Topic 8 (prompts), Topic 9 (mood captions), then Topic 10 (creators). B2B studio, filmmaker, and production-workflow pieces come once concept-sprint stills and a manual pilot offer are real.

---

## Articles to avoid

Do not brief, draft, or publish:

1. **Professional AI headshot roundups.** `ai headshot generator` is 22,200 US searches/month and a weak fit for a playful doodle studio.
2. **Generic `couple cartoon` inspiration lists.** That SERP is image boards and listicles. It is not “make a couple avatar.”
3. **WhatsApp / iMessage / ChatGPT sticker tutorials** that imply Doodle AI exports transparent chat-app stickers.
4. **Physical merchandise and print-fulfillment guides** (mugs, shipped sticker packs, “print-ready” posters) before fulfillment and verified dimensions exist.
5. **“Emotional Modes” or “Seasonal Pack” launch posts** written as if those skills generate today.
6. **Video, Sora, animatic, or lip-sync how-tos** that present Doodle AI as an animation pipeline.
7. **Pricing, subscription, or credit-pack landing articles** that treat Stripe as live.
8. **Enterprise SSO, private cloud, or guaranteed commercial-license explainers** before legal terms and the features exist.
9. **Thin keyword twins** of `/skills/normal/` that only swap `cartoonize` / `cartoonify` / `photo to cartoon` in the title.
10. **Competitor-bashing or fake comparison tables** without original, dated tests on Doodle AI, Canva, Fotor, Firefly, or ImageToCartoon.
11. **Brand-term essays** whose only targets are `ai doodle avatar`, `doodle avatar maker`, or `ai gift from photo` (no or negligible Ads volume). Those phrases belong in product copy, not as the reason for a 2,500-word post.
12. **Unprompted Grok “we are already cited” stories.** This product-aware session is not a mention baseline.
13. **Anything that omits doodleai.art** or that could be read as covering doodleai.fun, InstaDoodle, or LazyAvatar.
14. **Newsjacking generic AI headlines** with no path to a runnable Doodle AI skill.

If a requested idea falls in that list, decline it and point back to the backlog.

---

## Working agreement

The job of this blog is to make Doodle AI easy to find, easy to quote accurately, and easy to try. Success is a reader who understands the live workflow, sees a real doodle, and starts a generation on a runnable skill at **doodleai.art** — not a reader who was promised a feature that does not exist.
