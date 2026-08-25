# Doodle AI AEO and LLM Visibility Report

**Prepared:** 2026-08-24
**Updated:** 2026-08-25 (Firecrawl live-site check, X/@grok visibility, competitor and entity collisions)
**Project:** [Doodle AI](https://doodleai.art)
**Scope:** Answer Engine Optimisation (AEO), Google AI Overview eligibility, and visibility in Grok/ChatGPT/Perplexity/Gemini-style answers
**Decision goal:** Make Doodle AI easy for search engines and language models to understand, cite, recommend, and accurately describe.

> AEO is not a separate meta-tag trick. It is the combination of crawlable evidence, clear entity facts, useful answers, structured content, strong page experience, and legitimate third-party references. No vendor can guarantee that an LLM will mention a brand.

## 1. Executive summary

### What live evidence shows

- DataForSEO captured a Google AI Overview for **`ai cartoon generator`** in the US mobile SERP.
- That AI Overview described the category as tools that turn **text prompts or photos into animated characters and scenes**.
- It referenced Adobe Firefly, Renderforest, Higgsfield AI, Canva, and Animaker. **Doodle AI was not referenced.**
- The overview separated several intents: photo-to-cartoon, text-to-image/cartoon art, script-to-animation, and animated video creation.
- The other four tested queries—`photo to cartoon`, `photo to sticker`, `ai profile picture`, and `couple cartoon`—did not return a captured AI Overview in this snapshot, but all returned PAA and/or related-search opportunities.
- The current repository already includes `public/llms.txt`, JSON-LD for `WebSite` and `SoftwareApplication`, canonical metadata, a sitemap, and robots handling. These are useful foundations, but they do not by themselves create model visibility.

### Highest-impact AEO move

Expand the already-live **`/skills/normal/`** page into an evidence-rich answer for photo-to-doodle, then connect it to the other runnable skill pages and, only if needed, new hubs for profile pictures, pets, couples, sketches, sticker sheets, and gifts. Every page should answer the user’s definition, workflow, inputs, outputs, privacy, cost/credits, and limitations in plain language. Always name **doodleai.art** so models do not confuse it with doodleai.fun or LazyAvatar.

### Current measurement limitation

The 2026-08-24 session queried DataForSEO's live Google SERP and AI Overview data. It could not run Firecrawl or an unprimed Grok mention test.

The 2026-08-25 refresh used Firecrawl and live X posts. It still does **not** invent an organic Grok citation score: this Grok session has full Doodle AI product context, so it cannot count as an unprompted mention. Public `@grok` posts on X are recorded in [social.md](./social.md) instead. Re-run section 8 in a fresh Grok conversation with no brand hint before claiming a mention rate.

## 2. AEO data evidence

### DataForSEO SERP configuration

- Endpoint: Google Organic SERP Live Advanced through the official DataForSEO MCP.
- Location: United States, location code `2840`.
- Language: English.
- Device: mobile, iOS.
- Depth: 10 results.
- `load_async_ai_overview`: enabled.
- People Also Ask click depth: 1.
- Snapshot date: 2026-08-24.

| Query | Captured AI Overview | PAA | Images | Other formats | AEO decision |
|---|---|---|---|---|---|
| `ai cartoon generator` | Yes | Yes | — | People Also Search | First AEO landing page |
| `photo to cartoon` | No | Yes | Yes | App, People Also Search | Build answer + visual proof |
| `photo to sticker` | No | Yes | Yes | Knowledge graph, Perspectives, People Also Search | Clarify digital vs print intent |
| `ai profile picture` | No | Yes | Yes | People Also Search | Build social/avatar answer |
| `couple cartoon` | No | Yes | Yes | People Also Search | Avoid generic inspiration intent; target couple avatar |

### Captured AI Overview language

The `ai cartoon generator` overview said, in substance:

- An AI cartoon generator turns text prompts or photos into animated characters and scenes.
- Adobe Firefly was positioned for text-to-image/video creation.
- Canva was positioned for photo-to-cartoon conversion.
- Renderforest was positioned for script-to-cartoon creation.
- Animaker was positioned for automated cartoon videos.
- Higgsfield was positioned for selfies or descriptions into stylised characters.
- The suggested workflow was choose input, select style, generate/edit, and export.

### What Doodle AI must make explicit

Doodle AI should not rely on the model inferring its value from a generic homepage. State these facts in visible HTML:

1. **What it is:** Doodle AI is a conversational creative studio for turning ideas and photos into playful hand-drawn doodles.
2. **Primary input:** a photo upload or a text idea.
3. **Primary outputs:** doodle avatars, 3x2 collages, full-body action collages, die-cut sticker *sheets*, mood-caption collages, gift images, and surprise characters. Emotional Modes and Seasonal Pack are catalog previews, not runnable skills. Do not describe stickers as WhatsApp/iMessage exports.
4. **Interaction:** the user describes what they want, can attach a photo, and the agent selects or runs the appropriate skill.
5. **Generation path:** the browser sends a chat turn, the Mastra agent selects a skill, the generation tool calls the server-owned PicX connection, and the result is returned to the browser.
6. **Account and credits:** users can browse freely; creation, saving, syncing, and generation behavior must be explained accurately on the relevant page.
7. **Privacy:** provider credentials remain server-side; user images use the managed upload flow; do not promise deletion periods or commercial rights unless the product actually guarantees them.
8. **Limitations:** clearly identify which skills are live, which are previews, and whether generation returns one result or variants.

## 3. Existing machine-readable foundation

### Already present

The repository currently has:

- `public/llms.txt` with product description, technical flow, public URLs, and indexing boundaries.
- `WebSite` JSON-LD.
- `SoftwareApplication` JSON-LD.
- Canonical URLs, meta descriptions, Open Graph, Twitter cards, and robots controls in `src/layouts/AppLayout.astro`.
- A sitemap route and robots route.
- Server-rendered Astro pages.
- A public `/about/` page that explains the product and provider boundary.

### Improve carefully

- Keep `public/llms.txt` factual and update it whenever skills, routes, account behavior, or generation mechanics change.
- Add links in `llms.txt` for every public, indexable product and guide page once they exist. Do not list `/api/`, chat-private URLs, account pages, or unpublished roadmap routes as public product documentation.
- Add stable `@id` values and consistent absolute URLs to page-specific structured data.
- Add `ImageObject` data only for real, crawlable example images with stable URLs and accurate captions.
- Add `Article` data to articles and `HowTo` data to visible step-by-step pages.
- Add `FAQPage` data only when the same questions and answers are visibly rendered. Do not hide a large keyword FAQ only for crawlers.
- Consider `WebApplication` as a better semantic fit if the schema strategy is revised, but keep one consistent primary application type rather than emitting contradictory duplicates.
- Add `sameAs` only for official Doodle AI profiles and repositories. Never add unofficial competitor or social URLs as if they were owned entities.

## 4. AEO page architecture

### Page 1: `/ai-cartoon-generator/`

**Entity statement:** Doodle AI is a conversational AI cartoon generator that turns a photo or idea into a playful hand-drawn doodle.

**Answer blocks:**

- What is Doodle AI?
- Can Doodle AI turn a photo into a cartoon?
- How does the workflow work?
- What styles and skills are available?
- Can it make a profile picture, pet cartoon, couple avatar, sticker, or gift?
- Is it free to try?
- Do I need an account to generate or save?
- How are uploads and provider credentials handled?
- What should I include in a prompt?

**Proof:** before/after examples, real style labels, generation steps, a short prompt example, and links to the relevant skill pages.

### Page 2: `/photo-to-cartoon/`

Answer the direct transformation query. Use a concise first paragraph, a four-step process, output examples, file/input guidance, privacy and credits explanation, and a visible FAQ.

### Page 3: `/cartoon-profile-picture/`

Answer `profile picture cartoon`, `cartoon pfp`, `ai profile picture`, and `ai pfp generator`. Include square output guidance, social use cases, style choices, face/identity consistency limitations, and examples at useful sizes.

### Page 4: `/pet-cartoon/`

Answer `pet cartoon` and related natural-language questions. Include pet types, photo quality tips, examples, and honest limitations for group pets, dark photos, and unusual poses.

### Page 5: `/couple-avatar/`

Do not optimise this page around the generic informational phrase `couple cartoon`, whose live SERP is dominated by inspiration lists and image boards. Explicitly target “make a couple avatar from two photos” and explain whether two images are supported.

### Page 6: `/photo-to-sticker/` or the existing `/skills/stickers/`

The Sticker Pack skill **is runnable** and already has a public page at `/skills/stickers/`. It produces a square die-cut sticker *sheet* image, not a transparent PNG pack and not a WhatsApp/iMessage export. ChatGPT Images launched native chat-app stickers on 2026-08-24. Strengthen the existing skill page with that distinction; do not create a `/photo-to-sticker/` page that implies ChatGPT-style messaging stickers.

## 5. Question map from live SERPs

### AI cartoon generator

Use concise, directly answered headings:

- Can ChatGPT create a cartoon?
- How do I create an AI cartoon of myself?
- Can AI turn my photo into a cartoon?
- Is there a free AI cartoon generator?
- How can I cartoonize a picture for free?
- What is the difference between a photo cartoonizer and a text-to-cartoon generator?

### Photo to cartoon

- How do I convert my photo to cartoon?
- How do I do the ChatGPT cartoon trend?
- What is the best free app for converting pictures into cartoons?
- Is an AI cartoon generator free?
- Can I cartoonize a photo on my phone?
- What file types can I upload?
- Can I cartoonize a pet or group photo?

### Photo to sticker

- How do I turn a photo into a sticker?
- How can I convert a picture into a sticker?
- How do I convert a photo to a sticker on iPhone?
- Is there a free sticker maker app?
- Does the result have a transparent background?
- Is the output digital or print-ready?

### AI profile picture

- How do I get an AI profile picture?
- Can I use AI for my profile picture?
- What is the best AI to create a profile picture?
- Is there a free AI profile picture generator?
- What size should a profile picture be?
- Can I make a cartoon PFP from my photo?

## 6. Content format that LLMs can quote

Use a predictable answer-first structure on every public product page:

```markdown
# [Specific product answer]

[Two-sentence definition answering what the tool does, input, and output.]

## How it works
1. Upload or describe.
2. Choose or describe a style.
3. Generate with the relevant Doodle AI skill.
4. Save, download, or share the result.

## What you can make
- [Specific supported use case]
- [Specific supported use case]
- [Specific supported use case]

## Input and output details
[Accurate file, aspect-ratio, resolution, and account/credit details.]

## Privacy and limitations
[Accurate treatment of uploads, provider boundary, generation limits, and unsupported cases.]

## Frequently asked questions
[Visible questions with concise answers.]
```

### Answer-writing rules

- Put the direct answer in the first 40–60 words.
- Define one concept per paragraph.
- Use descriptive H2/H3 headings that resemble real questions.
- Prefer “Doodle AI does X” to vague marketing language.
- Put numbers, file formats, credit behavior, and limitations in text, not only in UI icons.
- Use tables for comparisons and step lists for procedures.
- Keep product claims aligned with the actual implementation and current skill roster.
- Include the date or “last updated” value for pages that contain changing product facts.
- Link from every answer page to the product action and to one relevant supporting page.

## 7. Entity and citation strategy

### Build a stable Doodle AI entity

Use the same spelling, domain, description, and product category across:

- Homepage title and description.
- About page.
- `public/llms.txt`.
- JSON-LD.
- GitHub repository README.
- Product profiles and launch pages.
- Social profiles owned by the project.
- Blog author and publisher information.

Recommended short description:

> Doodle AI is a conversational creative studio at doodleai.art that turns photos and ideas into playful, hand-drawn doodle avatars, collages, sticker sheets, gifts, and other visual creations.

Always include **doodleai.art**. Firecrawl search for `Doodle AI doodleai.art` on 2026-08-25 returned doodleai.fun, InstaDoodle, and cartoonize.ai/doodle-art before the actual product. Use a shorter capability-specific description on pages where not every skill is live. Do not claim that all roadmap skills are currently runnable.

### Earn citations instead of manufacturing them

Language models are more likely to trust and repeat facts that appear consistently in multiple useful, independently authored locations. Prioritise:

1. A clear official product page.
2. The public GitHub README and architecture explanation.
3. High-quality original examples with captions and alt text.
4. Helpful tutorials that explain the actual workflow.
5. Legitimate creator/user references and launch coverage.
6. Accurate third-party comparisons where Doodle AI is actually tested.

Do not create fake reviews, fake community posts, hidden text, or mass-generated near-duplicate pages.

## 8. Grok measurement plan

xAI's official Remote MCP documentation confirms that Grok-compatible API requests can configure an MCP server with:

- `server_url`
- `server_label`
- optional `server_description`
- optional allowed tools
- an `authorization` token that is sent as the Authorization header

The configured DataForSEO MCP endpoint is:

```text
https://mcp.dataforseo.com/v3/mcp
```

This makes DataForSEO available to a Grok client that supports custom remote MCP configuration, but it does not automatically measure Doodle AI's organic mention in Grok answers. A separate Grok visibility test is required.

### Grok prompt set

Run these prompts in a fresh conversation, with no brand hint, in at least three regions if supported:

1. What are the best AI tools for turning a photo into a cartoon?
2. Which AI tool can make a hand-drawn doodle avatar from my photo?
3. What is the easiest way to make a cartoon profile picture online?
4. Which tools can create a cartoon avatar for social media?
5. What can I use to turn a pet photo into a cartoon?
6. What is the best AI tool for making a couple avatar from two photos?
7. Which AI tools can make stickers from photos?
8. Compare Doodle AI, Canva, Fotor, and Adobe Firefly for photo-to-cartoon creation.
9. Is Doodle AI free, and how does its generation or credit system work?
10. Is Doodle AI safe for uploading personal photos?

### Record each answer

| Field | Description |
|---|---|
| Prompt | Exact user prompt |
| Date/time | UTC timestamp |
| Model/client | Grok model or product surface |
| Region/language | User location and language |
| Mentioned | 1 if Doodle AI is named |
| Recommended | 1 if Grok recommends it |
| Cited | 1 if doodleai.art or an official Doodle source is cited |
| Correct | 1 if the description is factually accurate |
| Competitors | Named alternatives |
| Intent fit | Photo, avatar, sticker, pet, couple, gift, or broad |
| Notes | Exact wording and errors |

### Visibility metrics

- **Mention rate:** answers naming Doodle AI / total answers.
- **Recommendation rate:** answers recommending Doodle AI / total answers.
- **Citation rate:** answers citing an official Doodle AI source / total answers.
- **Accuracy rate:** answers that correctly describe the product / answers that mention it.
- **Competitive share:** Doodle AI mentions divided by all named tools.
- **Prompt coverage:** intents where Doodle AI is mentioned at least once.

Run the same prompts monthly. Never compare scores across different models or client surfaces without recording the model and date.

## 9. Cross-assistant AEO test matrix

Use the same prompt set across:

- Grok.
- ChatGPT.
- Perplexity.
- Gemini.
- Google AI Overview, using DataForSEO SERP captures.

For every system, distinguish:

- Organic result inclusion.
- AI answer mention.
- Direct citation/link.
- Recommendation.
- Factual correctness.
- Whether a user can complete the promised workflow on the linked page.

The goal is not simply to appear. The goal is to appear with the correct capability, the correct URL, and a reason that matches the user's intent.

## 10. Current AEO gaps to close

1. **No dedicated high-intent public product page yet** for `ai cartoon generator` or `photo to cartoon`. The existing `/skills/normal/` page is live and in the sitemap, but it is a short skill card, not an answer page.
2. **Homepage H1 is conversational but ambiguous:** “What should we doodle?” Add a nearby explicit product statement without sacrificing the design. The homepage is also **omitted from the sitemap**; `/skills/` is the real public hub.
3. **No captured Doodle AI reference in the measured AI Overview.** Build the authoritative page and supporting citations before expecting visibility.
4. **Public `llms.txt` was stale on 2026-08-25.** The live file still described a client PicX key and `/api/generate`. The repo copy is the source of truth and must stay in sync after deploy.
5. **Product facts must be repeated consistently.** Current pages and future articles should agree on account requirements, the 5-credit signup grant, 1-credit generations, upload handling, and runnable vs coming-soon skills.
6. **AEO needs evidence:** publish original examples, process steps, supported formats, output limitations, and comparisons grounded in actual Doodle AI behavior.
7. **No unprimed Grok baseline exists yet.** Public `@grok` posts route cartoon requests to Grok Imagine and do not mention Doodle AI. Run section 8 in a fresh conversation before claiming a mention rate.
8. **Entity collision is live.** doodleai.fun, InstaDoodle, cartoonize.ai/doodle-art, and LazyAvatar occupy “doodle avatar” language. `sameAs` and visible `doodleai.art` URLs are required, not optional.
9. **Skill pages have no FAQ, how-to, credits, or privacy block.** They cannot be quoted as answers until those visible sections exist.

## 11. Implementation plan

### Week 1: factual foundation

- Finalise the canonical Doodle AI description and keep `doodleai.art` in it.
- Expand the existing `/skills/normal/` page into a real answer (what it is, how it works, photo requirement, 1:1 output, credits, limitations) before creating a duplicate `/photo-to-cartoon/` URL.
- Add a visible four-step workflow and a concise first answer.
- Add accurate FAQ content from the live PAA questions.
- Deploy the repo `public/llms.txt` so the live file matches the current product.
- Add page-specific JSON-LD and validate it against the visible content.

### Weeks 2–4: evidence and topical coverage

- Add real before/after images with captions and alt text.
- Add `/cartoon-profile-picture/`, `/pet-cartoon/`, and `/couple-avatar/` where the workflows exist.
- Publish two useful guides, not a large batch of thin pages.
- Add contextual internal links from the homepage, skills pages, and articles.
- Document privacy, credits, input, output, and limitations consistently.

### Month 2: citations and measurement

- Run the Grok and cross-assistant prompt set.
- Record mention, recommendation, citation, and accuracy rates.
- Re-run the five DataForSEO SERPs and compare AI Overview references.
- Acquire legitimate third-party references through product launches, creator examples, and tested reviews.
- Add a comparison page only when it contains original, verifiable product tests.

### Month 3: refresh and expand

- Expand the page that earns the strongest qualified traffic and generation starts.
- Add sticker/gift pages only when the feature is real and the output is clearly defined.
- Refresh `llms.txt`, schema, FAQs, and internal links after product changes.
- Run a controlled competitor crawl with Firecrawl if its MCP is configured.

## 12. Safe AEO checklist

### Content

- [ ] The first paragraph answers what Doodle AI does.
- [ ] Each page has one primary user intent.
- [ ] The page states supported input and output.
- [ ] The page explains how to use the tool.
- [ ] The page contains visible, concise answers to relevant questions.
- [ ] Claims are accurate for the current runnable skills.
- [ ] Examples are original and labelled.

### Technical

- [ ] Server-rendered HTML contains the core answer.
- [ ] Canonical URL is correct and absolute.
- [ ] Page is indexable and appears in the sitemap.
- [ ] Private API/account/chat routes are noindex and excluded.
- [ ] JSON-LD matches visible page content.
- [ ] Images have stable URLs, dimensions, and descriptive alt text.
- [ ] `public/llms.txt` links to the current public documentation.
- [ ] No hidden keyword blocks or fake FAQ content.

### Measurement

- [ ] DataForSEO query and SERP snapshot date recorded.
- [ ] AI Overview presence recorded per query.
- [ ] Grok model, client, region, and date recorded.
- [ ] Exact prompts preserved.
- [ ] Mention and citation rates calculated separately.
- [ ] Factual accuracy manually checked.
- [ ] Qualified conversion measured alongside visibility.

## 13. Sources

- [xAI Remote MCP Tools](https://docs.x.ai/developers/tools/remote-mcp)
- [DataForSEO MCP](https://dataforseo.com/model-context-protocol)
- [DataForSEO Google Organic SERP Live Advanced](https://docs.dataforseo.com/v3/serp/google/organic/live/advanced/)
- [DataForSEO Google Ads Search Volume Live](https://docs.dataforseo.com/v3/keywords_data/google_ads/search_volume/live/)
- [Doodle AI llms.txt](https://doodleai.art/llms.txt)
- [Doodle AI](https://doodleai.art)
- [Doodle AI skills](https://doodleai.art/skills/)
- [ImageToCartoon](https://imagetocartoon.com/)
- [Canva AI cartoon generator](https://www.canva.com/features/photo-to-cartoon/)
- [Fotor photo-to-cartoon converter](https://www.fotor.com/features/photo-to-cartoon/)
- [Adobe Firefly AI cartoon generator](https://www.adobe.com/products/firefly/features/ai-cartoon-generator.html)
- [LazyAvatar](https://lazyavatar.com)
- [Social knowledge-sharing report](./social.md)

## 14. Important interpretation note

AEO results are volatile and probabilistic. A captured AI Overview is evidence that the query has an answer surface, not proof that the same overview will appear for every user. A brand mention is valuable only when it is accurate, relevant to the prompt, and backed by a page the user can actually use.
