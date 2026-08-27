# Skills research & expansion plan — August 2026

Evidence-led plan for the next 20 skills, plus the architecture change the
evidence demands. Every skill below traces to a real post, product, or
storefront with a number attached. Ideas with no evidence were **rejected**
and are listed at the bottom so we don't re-invent them next quarter.

Research method: two `grok` CLI passes over X (last 6 months) plus web
corroboration. Sources are inline. Where a claim is inferred from a secondary
writeup rather than the post itself, it says so.

---

## 1. The headline finding: our unit of output is wrong

We ship **one image per generation**. The market has settled on a **pack**.

| Evidence | Number |
|---|---|
| ChatGPT Stickers launch (24 Aug 2026) — 9 stickers, 18 styles, transparent bg, iMessage/WhatsApp | [2,878 likes, 387k views](https://x.com/ChatGPT/status/2091996384954069032) |
| "at least 20 cute sticker-style illustrations of **this exact character**" — @MatoToushi | [854 likes, **1,674 bookmarks**](https://x.com/MatoToushi/status/2036103988966523322) |
| "Multiple different emotional reactions arranged in a grid" — @Noor_ul_ain43 | [696 likes, 580 bookmarks](https://x.com/Noor_ul_ain43/status/2027718541743661070) |
| "same person in 6 different moods… keep the character recognizable" — @oggii_0 | [106 likes, 46 bookmarks, 30 replies](https://x.com/oggii_0/status/2081980605747880354) |
| 3×3 transparent sheet + "take this to Xiaohongshu and custom-make packs" — @HoodyLiu | [76 likes, 72 bookmarks](https://x.com/HoodyLiu/status/2092498652648677487) |
| Korean "15 independent Kakao emotes, all the same person" tutorial | [218k views, 4.5k likes](https://www.youtube.com/watch?v=xQT7JdBPL8Y) |
| Lensa Magic Avatars — paid SKU | 50 for $7.99 / 100 for $11.99 |
| WhatsApp sticker pack minimum | 3 stickers — **one image cannot be a pack** |

Note the bookmark-to-like ratios: 1,674 bookmarks on 854 likes means people
saved the recipe to *run it*. Bookmarks are the strongest intent signal in the
dataset, and they cluster entirely on **multi-output sheets**.

**Demand is variations-of-one-person (~80%), not a set-of-different-things.**
Grok found no organic post asking for "9 different characters from one photo."
Every high-bookmark prompt asks for the *same* face across many expressions.

Our `sticker-pack` and `doodle-collage` skills fake this with a **composite
sheet on white** — one flat image with panels drawn inside it. That is not a
sticker pack. It cannot be cut, has no alpha, and can't be installed anywhere.

### 1.1 The technical blocker (verified today)

I pulled the live PicX OpenAPI schema:

```
/v1/images/generate → prompt, model, size, aspect_ratio, callback_url, webhook, idempotency_key
/v1/images/edit     → instruction, image_urls, model, size, callback_url, webhook, idempotency_key
```

Two things are missing and both are on the critical path:

1. **No `n` / `num_images`.** One call returns one `url`. Multi-image must be
   **N parallel calls**, which is the pattern the PicX playground already uses
   (`numImages > 1` fires N parallel `runTask` calls, each with its own
   generation ID).
2. **No `background: transparent`.** GPT-Image-2 gained this parameter on
   21 Aug 2026 but PicX doesn't expose it. **We own PicX** — this is a
   one-parameter passthrough on our own API, not a vendor dependency.

Three things in our code assume single-image and will need changing:

| File | Assumption |
|---|---|
| `/Users/yash/Projects/doodle-ai/src/mastra/tools/generate-doodle.ts` | `outputSchema` returns one `url`; reads `data.url` |
| `/Users/yash/Projects/doodle-ai/src/lib/credits/costs.ts` | flat **1 credit** for every skill "including multi-image ones like stickers" — a 9-call pack at 1 credit loses money on 8 calls |
| `/Users/yash/Projects/doodle-ai/src/db/schema/product.ts` | `generation.outputUrl` is singular |

The credit comment is already honest that this is a known debt: *"revisit if a
specific skill's PicX cost stops being covered by a single credit."* A 9-image
pack is that moment.

---

## 2. What people complain about (the differentiation surface)

The USP isn't "more skills." It's **being the tool that doesn't do the four
things everyone complains about.** In rank order of how loud the complaints are:

1. **Likeness.** The single loudest gripe. Korea's Kakao Karlo, ₩990/30
   portraits: *"Of 30 AI profile pics, about 2 actually looked like me."*
   ([Hankyung](https://www.hankyung.com/article/202402206668g), category worth
   ₩347bn/yr). Fiverr's top-rated caricaturists win on exactly this — a client
   on [indramousely](https://www.fiverr.com/indramousely/change-your-photo-into-a-portrait-cartoon)
   (1,673 reviews): *"You are the first one to even come close to getting his
   features correct out of like four to five people."* Lensa's multi-photo
   input beat single-photo. **We accept one photo.**
2. **Paywalls / wasted rolls.** ToonMe Play Store review: *"Sifting through
   50-100 options to find a specific one only for it to be pay walled."*
   People pay knowing a third of the output is trash — they resent the roll,
   not the price.
3. **Watermarks.** On the ChatGPT sticker announcement, @justincleduc:
   *"Let's not pretend like the 'invisible' watermark noise isn't a deterrent…
   It's so much more apparent when you scale down."* Grok still burns a visible
   watermark. We currently add none — keep it that way and say so.
4. **Fake transparency.** Checkerboard-on-a-JPEG reads as a scam. Transparent
   PNG is a **billed line item** on Fiverr gigs (exofarartwork, 2,219 reviews:
   "JPG + transparent PNG").

And from the paid side, what buyers actually pay for: **revisions.** Etsy
CartoonPortrait (47.1k sales, 10.4k reviews, 4.9★): *"He'll tweak any photo to
just how you want it!"* Another: *"gave me different drafts, different
background color options, and made every change."* Our chat-first architecture
is genuinely well-suited to this and we're not using it as a selling point.

---

## 3. The 20 skills

Engagement column = best single real datapoint found. "Uncontested" means no
English-language competitor shipped it. Multi = needs N parallel images.

### Tier A — proven demand, directly our lane (build first)

| # | Skill | Evidence & engagement | Multi | Why |
|---|---|---|---|---|
| 1 | **Expression Sticker Sheet** — 9 die-cut stickers, same face, true alpha | [854 likes / 1,674 bookmarks](https://x.com/MatoToushi/status/2036103988966523322); [696/580](https://x.com/Noor_ul_ain43/status/2027718541743661070); ChatGPT 2,878/387k | 9 | Highest-bookmark format in the dataset. Flagship. Replaces the fake white-sheet `stickers`. |
| 2 | **Chibi Mini-Me Overlay** — keep the real photo, add chibi twins + handwritten notes | [3,516 likes / 651 RT / 224k views / 2,372 bookmarks](https://x.com/Ciri_ai/status/2050094437821513896); [1,164/47k](https://x.com/Sairah_0/status/2050167506204238103) | 1 | **Highest raw engagement of anything in our lane.** Copied dozens of times May–Jul. We don't have it. |
| 3 | **Anime / Ghibli Me** | [1,509 likes/160k/1,522 bookmarks](https://x.com/retasu_496/status/2058102358530519133); [1,238/127k](https://x.com/xVarello/status/2074849438401486929) | 1 | The default ask on X — "hey @grok turn me into an anime character" is a *feed format*, daily. Contested but it's table stakes. |
| 4 | **Ugly-Cute Crayon Self** — "drawn by a 4-year-old with crayons" | [834 likes / **203 quotes** / 275k views / 761 bookmarks](https://x.com/yr7191/status/2052686034803265672); [462/28k](https://x.com/umesh_ai/status/2027699861827838249); [Forbes, May 2026](https://www.forbes.com/sites/lesliekatz/2026/05/06/chatgpt-trend-has-users-requesting-clumsy-scribbly-and-pathetic-ai-images/) | 1 | 203 quotes = people ran it and posted results. Deliberately-bad is *anti-slop* — strong brand fit for a doodle app, and premium tools structurally can't chase it. |
| 5 | **Couple Doodle** | [4,962 likes/97k](https://x.com/_you_like_TOP/status/2031579196934467811) (proposal); Fiverr [sweet_christine 3,942 reviews](https://www.fiverr.com/sweet_christine/make-a-cartoon-out-of-you); couple caricature $30 gigs; Etsy BananaRoseArt 19.7k sales | 1 | Weak X virality, **strong wallet**. Also our own DataForSEO finding: "couple cartoon" 9,900/mo, comp-index 3. |
| 6 | **Pet + Owner Doodle** | [798 likes/23k](https://x.com/mushrisepark/status/2092587358893875682) (backlash — proves platforms auto-stickerize pets); Peta Sticker JP ships 9 patterns from 1 pet photo; pet-portrait shop hit $1M | 1 | Etsy/print business more than viral toy. Pairs with #1 as a pack. |
| 7 | **Style Roll — pick 4** — same photo, 4 style takes, user keeps one | Lensa 50–100 pack $7.99–11.99; Naver Webtoon 4 images ₩2,000; Xiaohongshu sellers generate 3, pick 1; Etsy *"gave me different drafts"* | 4 | Directly answers complaint #2. Turns a bad roll from a refund into a choice. |

### Tier B — uncontested geo lanes (real products, zero English competition)

| # | Skill | Evidence & engagement | Multi | Why |
|---|---|---|---|---|
| 8 | **LINE Stamp Sheet** — 370×320, transparent, LINE-store ready | [Peta Sticker](https://peta-sticker.com) live product: 1 pet photo → 9 patterns free preview, then pay. Creators openly teach "AIでLINEスタンプ月100万" | 8–9 | Format-locked = defensible. Japan pays for LINE stamps as a *business*. |
| 9 | **Kakao Emote Pack** — 15 emotes, same face | [218k views / 4.5k likes](https://www.youtube.com/watch?v=xQT7JdBPL8Y) ("don't pay for Kakao emotes"); 118k-view Mar 2026 tutorial | 15 | Native Korean job. English X never had KakaoTalk. |
| 10 | **Q版 九宫格 Emoji Pack** — 3×3 grid, transparent | [@HoodyLiu 76 likes/72 bookmarks](https://x.com/HoodyLiu/status/2092498652648677487) explicitly *"take to Xiaohongshu and custom-make packs for people"*; sellers charge 39–99 RMB/set | 9 | Someone is manually reselling this. That's a product. |
| 11 | **Childhood Me** — generate your 3yo/6yo self from an adult photo | Juejin workflow (20 Aug 2026, Jimeng/Seedream): 3yo / 6yo / kid ID photo / Polaroid / adult×child composite | 4–5 | **Zero English signal.** Emotionally strong, inherently multi-output. |
| 12 | **Festival Pack** — Rakhi, Diwali, Onam, Pongal | [NDTV, 26 Aug 2026](https://ndtv.in/tech/create-personalized-ai-rakhi-stickers-using-chatgpt-send-on-whatsapp-11961254): 8 chibi Raksha Bandhan scenes for WhatsApp. India = **#1 market, 1bn images in under a month** ([ET/Altman](https://economictimes.indiatimes.com/news/new-updates/trending-chatgpt-images-2-0-prompts-india-crosses-1-billion-ai-generated-photos-in-under-a-month/articleshow/131170172.cms)) | 8 | Recurring seasonal SKU with a calendar. WhatsApp-native. |
| 13 | **年賀状 New Year Card** — family photo → illustrated nengajo | Vidnoz JP and PerfectCorp both ship nengajo-from-photo flows | 1 | Entire seasonal category in Japan, no English equivalent. |
| 14 | **Webtoon Caricature** — thick-line webtoon style + speech bubble | Naver Webtoon (Dec 2024): selfie → 4 images in a named artist's style, ₩2,000, bubble included | 4 | Use **generic** webtoon style, not named artists — IP risk. |
| 15 | **Matching Pair Avatars** — 情侣/闺蜜头像, two coordinated halves | Sohu (Oct 2025): *"AI一键搞定闺蜜/情侣头像，不用约稿省500+"* — replaces a ~500 RMB commission | 2 | Inherently two images. Built-in virality: one person sends the other half. |

### Tier C — wallet lanes (weak on X, strong on Etsy/Fiverr)

| # | Skill | Evidence & engagement | Multi | Why |
|---|---|---|---|---|
| 16 | **Faceless Portrait** — minimal, no facial features | [PunoPrints](https://www.etsy.com/uk/shop/PunoPrints): **113.6k sales, 28.9k reviews, 4.8★**, claims top-selling in faceless portrait. Buyer: *"I don't show my kids faces online so puno has done a few of these for me now"* | 1 | Biggest paid shop found — and it's the **opposite** of our assumption that the face is the product. Privacy-first parents are a real segment. |
| 17 | **Family Portrait Illustration** | [EditingStudio](https://www.etsy.com) 136.5k sales / 5.7k reviews / 4.9★; Pixxelly Pixar-family 2.2k sales; [@Taaruk_ 158 likes](https://x.com/Taaruk_/status/2068009389475422452) | 1 | Fiverr prices **per figure** (mangdesain: $5 head / $15 half / $20 full) — natural credit tiering. |
| 18 | **Occupation Caricature** — surgeon, pilot, teacher | [CartoonPortrait](https://www.etsy.com/uk/shop/CartoonPortrait): **47.1k sales, 10.4k reviews, 4.9★**, occupation gigs named explicitly; rhymes with [Forbes workplace-caricature trend](https://www.forbes.com/sites/lesliekatz/2026/02/06/chatgpt-trend-turns-people-into-caricatures---and-shows-how-well-ai-knows-us/) (Feb 2026) | 1 | 10k reviews of pure gifting demand. |
| 19 | **3D Designer-Toy Me** — collectible vinyl caricature | [@Waseem__786Ai 327 likes/49k](https://x.com/Waseem__786Ai/status/2063062634455273585); [@yskanth 393/66k](https://x.com/yskanth/status/2081594032312967469) | 1 | Mid signal, cheap to add, different visual axis from doodle. |
| 20 | **Chat-History Caricature** — "the me that leaked from my chat log" | [@rascal8023 129 likes / **40 quotes** / 27k views](https://x.com/rascal8023/status/2053776942537830481) (JP: 「会話履歴から流出した私」) | 1 | Small but novel, and we have thread history client-side already. Quote ratio is high. |

**Not a skill but ranks above most of them: Multi-Photo Likeness.** Accept 3–5
photos instead of 1. Lensa's multi-photo mode beat single-photo; likeness is
complaint #1; Fiverr's top gigs win on it. This should probably ship *before*
half the list, because every skill above inherits its accuracy.

---

## 4. Rejected — no evidence found

Grok searched for each of these and found no real posts. Listed so we stop
proposing them:

| Rejected | What was actually found |
|---|---|
| Wedding / invitation illustration | One product tweet, **0 likes**. (Caveat: paid wedding demand *does* exist on Etsy — a buyer in Mar 2026: *"can't wait to utilize it for our wedding!"* So: not a viral skill, possibly a paid one.) |
| Pregnancy / baby announcement cards | Nothing. |
| Memorial / tribute portraits | Nothing on X. Appears only as a gift *occasion* in Etsy listing titles. |
| Fitness before/after glow-up | Gym **chibi overlay** is big (#2). Body-transformation cartoons: nothing. |
| Instagram highlight covers | Nothing. |
| Twitch / Discord emotes from a selfie | Emote artists actively advertise **"NO AI."** Hostile market. |
| YouTube thumbnails | Creator tooling, not "cartoon me." |
| Tattoo mockups from a photo | Only "hey @grok what does this tattoo mean." |
| Coloring book from a family photo | People do generic coloring books, or the reverse direction. |
| Comic strip of my day | Storyboards are for ads and AI video. |
| Slack/Teams office caricature | Only the Japanese chat-history version (#20). |

**One deliberate non-target.** The single biggest number in the entire research
set is [@shushant_l's corporate headshot how-to: 10,273 likes, 1,190 reposts,
1.15M views, 20,139 bookmarks](https://x.com/shushant_l/status/2036820521371967624).
It is **photoreal**, not illustrated. The one Notion-style *cartoon* headshot
post got **21 likes**. Chasing LinkedIn avatars means abandoning doodle as a
style. Recommend we don't, and record that we chose not to.

---

## 5. Sequencing

**Phase 0 — unblock (nothing else works without this)**
1. Add `background: "transparent"` passthrough to PicX `/v1/images/{generate,edit}` for `gpt-image-2`. We own that API.
2. `generate-doodle.ts`: `outputSchema` → `urls: string[]`; N parallel calls with per-image `idempotency_key`; partial-failure handling (refund only the failed calls).
3. `costs.ts`: per-skill credit cost = image count. Kill the flat 1.
4. Schema: a pack needs N rows or an output-set — `generation.outputUrl` singular no longer fits.

**Phase 1 — flagship pack (4 skills)** — #1 Expression Sheet, #2 Chibi Mini-Me,
#4 Crayon Self, #7 Style Roll. This is the smallest set that proves the pack
architecture and hits the three highest-engagement recipes found.

**Phase 2 — likeness + geo (5)** — Multi-Photo Likeness, then #8 LINE, #9 Kakao,
#10 九宫格, #12 Festival. Uncontested and calendar-driven.

**Phase 3 — relationships (4)** — #5 Couple, #6 Pet+Owner, #15 Matching Pair, #11 Childhood Me.

**Phase 4 — wallet (4)** — #16 Faceless, #17 Family, #18 Occupation, #3 Anime Me.

**Phase 5 — long tail (3)** — #13 年賀状, #14 Webtoon, #19 3D Toy, #20 Chat-History.

Also: promote or kill the two stale roadmap packages (`emotional-modes`,
`seasonal-pack`). `seasonal-pack` is now largely subsumed by #12 Festival Pack,
which has actual evidence behind it.

---

## 6. Skill format — does ours hold up?

Our `SKILL.md` format (Agent Skills spec frontmatter + a `metadata:` block,
parsed once by `/Users/yash/Projects/doodle-ai/src/lib/skill-loader.ts`,
build-time validated against `GENERATION_MODES` in both directions) is
genuinely good and I'd keep it. Single authoring directory, build fails on
drift, roadmap skills can't leak to the agent.

Three fields the new skills need that it can't express today:

| Field | Why |
|---|---|
| `imageCount: number` | Pack size. Drives credits, UI skeletons, and the N-parallel fan-out. |
| `background: 'white' \| 'transparent'` | Stickers need alpha; cards don't. Currently unexpressible. |
| `inputPhotos: { min, max }` | Multi-photo likeness; `requiresPhoto: boolean` can't say "3–5". |

Adding these keeps the one-directory property while making the pack skills
declarative rather than special-cased in the tool.

---

## Open question before Phase 0

Pack skills change the credit model. A 9-image sticker sheet is 9 PicX calls.
At today's flat 1 credit that's an 8-call loss, and the signup grant is 5
credits — one pack would eat most of a new account's balance before they see
anything. Options: charge per image, charge a discounted pack rate (e.g. 6
credits for 9), or give the first pack free as the onboarding moment. This is
a pricing decision, not a technical one.
