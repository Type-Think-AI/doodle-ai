# Doodle AI — Ideal Customer Profile and Revenue Opportunities

**Prepared:** 2026-08-24
**Updated:** 2026-08-25 (live skill/credit facts, X sharing behavior, ChatGPT sticker and LazyAvatar competition)
**Project:** [Doodle AI](https://doodleai.art)
**Product:** Conversational creative studio for turning photos and ideas into hand-drawn doodle avatars, collages, sticker sheets, gifts, and other visual creations
**Purpose:** Define who Doodle AI should serve first, why they would use it, how to reach them, and which revenue opportunities are worth validating.

> This document separates **current product facts** from **commercial hypotheses**. Doodle AI currently uses organization-pooled server credits and signup grants. The organization/team backend foundation exists; Stripe checkout, paid credit packs, and subscriptions are planned in the roadmap but are not implemented yet.

## 1. Executive summary

### Primary ICP

**Social-first young adults and creators who want a distinctive visual identity without learning design software.**

They have a selfie, pet photo, couple photo, or idea and want a playful avatar, profile picture, sticker sheet, collage, or shareable gift. They value speed, personality, easy prompting, and a result that feels more personal than a generic AI filter.

### Strongest secondary ICPs

1. **Pet parents** who want a cute, shareable cartoon or gift from a pet photo.
2. **Couples and friend groups** who want matching avatars, collages, or occasion content.
3. **Gift buyers** who need a fast personalized visual for a birthday, anniversary, holiday, or celebration.
4. **Micro-creators and small businesses** who need recurring branded stickers, profile assets, social visuals, or character content.
5. **Community and event organizers** who want a playful visual activity or attendee asset, after the consumer workflow is proven.

### Best first commercial bet

Start with a **free-to-try, paid-to-finish credit model**:

- Browse and explore for free.
- Give a small signup grant so a new user experiences one successful result.
- Sell one-time credit packs first.
- Add subscriptions only after repeated-generation behavior is proven.
- Add premium event packs, creator packs, and gift/export upgrades after the core flow converts.

### Avoid initially

Do not lead with professional headshots, generic “AI art,” enterprise design tooling, or physical merchandise. Those markets are larger or more crowded but are not the clearest match for Doodle AI’s playful, conversational product.

## 2. Current product facts

These facts are grounded in the current repository and should be treated as the source of truth for customer messaging:

- Doodle AI is an Astro and Mastra chat-first creative application.
- Users can browse without an account, but sign-in is required for upload, generation, saving, and synced account work.
- Generation uses a server-owned PicX connection; users do not enter provider API credentials. Live public copy must not tell people to paste a PicX key into Settings.
- Generation is metered through an organization-pooled credit ledger. New accounts receive **5 signup credits** into their personal organization. Every runnable skill costs **1 credit**. Credits are reserved before generation and refunded when a generation fails.
- The Better Auth organization layer supports personal organizations, up to 5 organizations, up to 25 members, owner/producer/artist/reviewer/client roles, active-organization sessions, and membership/permission rechecks.
- Runnable skills: normal doodle avatar, collage, full-body collage, surprise, stickers (die-cut *sheet*), mood captions, and gift.
- Not runnable, still shown as coming soon: Emotional Modes, Seasonal Pack.
- Organization-scoped API data includes threads/messages, saved characters as shared references, moodboards, generation records, and pooled credits. `GET /api/v1/me` returns the active organization, organizations, role, balance, and member count.
- A polished team switcher and end-to-end project, asset, share-link, batch, or review UI were not verified in the audited page tree; their schema/access-control foundations should be described as partial, not as finished enterprise features.
- The Agent Skills catalog is the product's extensibility model.
- Signed-in work can be synchronized across devices through the server-backed account path, while signed-out work retains a local experience.
- Stripe payment checkout and subscription flows are planned, not live.
- Variant generation, user-authored “fork as skill,” server-side conversation memory, voice input, transparent WhatsApp/iMessage sticker export, and video are not current product capabilities.

**Commercial rule:** Never promise a feature, download format, number of variants, commercial license, or deletion period until the underlying implementation and policy exist.

## 3. ICP definition

An ideal customer is not simply someone who likes AI images. The best customer has all or most of these properties:

1. Has a personal photo or visual idea ready now.
2. Wants an emotional, social, or identity outcome—not just technical experimentation.
3. Can recognise value from one successful image.
4. Is comfortable using a conversational prompt or can be guided by examples.
5. Has a reason to return for multiple people, moods, occasions, or formats.
6. Shares visual results with friends, followers, or communities.
7. Will pay for convenience, personalization, more attempts, or a time-sensitive result.

## 4. Priority customer segments

### Segment A — Social identity creator

**Priority:** Primary
**Best product:** Doodle avatar, cartoon profile picture, PFP, mood avatar, collage
**Likely age range:** 16–34
**Use case:** Profile image, social post, messaging avatar, personal rebrand, “new look” content

#### Profile

- Uses Instagram, TikTok, Snapchat, WhatsApp, Discord, Reddit, or similar visual communities.
- Wants a profile picture that feels different from a standard selfie or polished headshot.
- Enjoys trends but wants a more personal version of them.
- May arrive from a phrase such as “cartoon PFP,” “AI profile picture,” or “turn selfie into cartoon.”
- Often makes a decision within one session and shares the output quickly.

#### Jobs to be done

- “Make me a profile picture that looks like me but feels more fun.”
- “Give me a matching avatar for my social accounts.”
- “Turn this selfie into a style I can share.”
- “Help me choose a visual identity without using Photoshop.”

#### Buying triggers

- Changing profile picture.
- Joining a new community or server.
- A viral cartoon/avatar trend.
- Birthday or identity refresh.
- Seeing a friend's distinctive AI avatar.
- Wanting several moods or seasonal variations.

#### Barriers

- Concern that the result will not resemble them.
- Fear of a generic AI look.
- Sign-in friction before seeing value.
- Uncertainty about credits and whether the first attempt is free.
- Privacy concern around uploading a face photo.

#### Message that should convert

> Turn your photo into a hand-drawn doodle avatar that feels like you—not another generic filter. Upload a photo, describe the mood, and create a profile picture you can actually share.

#### Revenue potential

**High for one-off packs and repeat style variations.** The user may pay for several attempts, alternate moods, seasonal packs, or a matching set across platforms.

### Segment B — Pet parent

**Priority:** Primary secondary
**Best product:** Pet cartoon, pet avatar, gift, die-cut sticker sheet
**Use case:** Pet profile picture, memorial/celebration image, phone wallpaper, gift, social post

#### Profile

- Has a strong emotional connection to a dog, cat, or other pet.
- Shares pet photos socially and responds to cute or personalized content.
- May not search for “AI art”; they search for “pet cartoon,” “cartoon my dog,” or “pet portrait.”
- More likely to buy when the result is positioned as a keepsake or gift rather than a tool.

#### Jobs to be done

- “Make my pet into a cute character.”
- “Create a gift for someone who loves their dog.”
- “Turn several pet expressions into a sticker sheet.”
- “Make a memorial or celebration image that feels respectful.”

#### Buying triggers

- Pet birthday or adoption anniversary.
- New pet adoption.
- Holiday or personalized gift shopping.
- A pet account or creator post.
- Memorial or remembrance moment.

#### Barriers

- Poor results for unusual poses, dark photos, or multiple animals.
- Sensitivity around memorial content.
- Need for a high-quality downloadable result.
- Concern that the tool is only for human portraits.

#### Message that should convert

> Turn your pet’s favorite photo into a playful hand-drawn character, gift image, or sticker-style keepsake.

#### Revenue potential

**High emotional willingness to pay.** Gift framing can support a higher one-time purchase than a generic avatar, but only if output quality is reliable and download/use rights are clear.

### Segment C — Couple and friend-group creator

**Priority:** Secondary
**Best product:** Couple avatar, collage, full-body action collage, matching stickers, gift
**Use case:** Matching profile pictures, anniversary post, friendship memory, group chat image, event content

#### Profile

- Has two or more people and wants a shared visual.
- Often has a deadline tied to a birthday, anniversary, trip, wedding, or celebration.
- Values composition and relationship cues more than photorealism.
- May search for “couple avatar,” “couple cartoon picture,” “matching PFP,” or “cartoon couple.”

#### Jobs to be done

- “Make a matching avatar from our photos.”
- “Turn our memory into a fun collage.”
- “Give our group chat a visual identity.”
- “Create a couple gift without hiring an illustrator.”

#### Buying triggers

- Anniversary or Valentine's Day.
- Wedding or engagement.
- Friendship milestone.
- Vacation or group trip.
- Matching social profile refresh.

#### Barriers

- The product may not yet support multiple source images in one generation.
- Generic `couple cartoon` search intent is heavily informational and inspiration-led.
- Users need confidence that faces and relationship composition will remain coherent.
- Timing matters; failed generations are especially frustrating before an event.

#### Message that should convert

> Make a shared doodle avatar or collage for the people who belong in the same picture.

#### Revenue potential

**Medium-to-high seasonal potential.** Couple and group products are naturally suited to bundles, occasion packs, and gift pricing.

### Segment D — Personalized gift buyer

**Priority:** Secondary, high future value
**Best product:** Gift mode, portrait, pet portrait, couple image, printable/downloadable output
**Use case:** Birthday, anniversary, holiday, thank-you, graduation, memorial, friendship gift

#### Profile

- Is buying for someone else and needs confidence more than experimentation.
- Has a specific occasion and deadline.
- Wants a result that is easy to download, send, print, or present.
- May be less interested in the AI process and more interested in the emotional result.

#### Jobs to be done

- “Create a thoughtful personalised gift quickly.”
- “Make something unique from a photo I already have.”
- “Give me an output I can send today.”
- “Help me make a gift when I am not a designer.”

#### Buying triggers

- Occasion date.
- Gift procrastination.
- Personalized-gift search.
- Seeing an example that maps directly to the recipient.
- Seasonal landing page or gift guide.

#### Barriers

- Unclear output resolution, file type, or delivery.
- Lack of trust around photo privacy.
- No physical fulfillment if the buyer expects a printed product.
- No guarantee that the image will be good enough to give.

#### Message that should convert

> Start with one meaningful photo and make a personal doodle gift in minutes.

#### Revenue potential

**High potential but operationally demanding.** Start with digital downloads and transparent output expectations. Add physical fulfillment only after demand and quality are proven.

### Segment E — Micro-creator and small business

**Priority:** Secondary
**Best product:** Repeatable avatar, branded character, sticker pack, content variations, full-body action collage
**Use case:** Creator identity, social content, community stickers, stream assets, small-brand mascots

#### Profile

- Publishes repeatedly and needs more than one image.
- Values speed, consistency, and a recognizable visual style.
- May use a personal character across posts, thumbnails, messages, or community channels.
- Has higher lifetime value than a one-time consumer if consistency is reliable.

#### Jobs to be done

- “Give me a repeatable character for my content.”
- “Make several expressions and poses from one identity.”
- “Create a sticker set for my community.”
- “Make visual content without commissioning an illustrator every week.”

#### Buying triggers

- Launching a channel, newsletter, product, or community.
- Rebranding.
- Preparing a content batch.
- Creating Discord/community sticker *sheets* or mascots. WhatsApp/iMessage sticker export is now a ChatGPT Images job, not a current Doodle AI job.
- Need for a mascot or recurring character.

#### Barriers

- Character consistency across generations.
- Unclear commercial usage rights.
- Need for batch generation and variants, which are not fully implemented.
- Higher quality expectations than casual users.
- Need for receipts, predictable costs, and reliable export.

#### Message that should convert

> Build a recognizable doodle character and turn it into the visual language for your content and community.

#### Revenue potential

**Highest long-term LTV potential.** This segment can justify creator packs, monthly plans, brand kits, batch generation, commercial licensing, and team workflows—but only after consistency and rights are documented.

### Segment F — Community, event, and education organizer

**Priority:** Later
**Best product:** Event pack, group collage, themed stickers, attendee avatars, workshop activity
**Use case:** School activity, online community, event identity, team celebration, campaign asset

#### Profile

- Needs multiple related outputs rather than one personal image.
- May be a teacher, community moderator, event organizer, club leader, or marketing freelancer.
- Values moderation, predictable output, privacy, and bulk pricing.

#### Revenue potential

**Potentially high contract value, low initial priority.** Do not pursue enterprise sales before the self-serve workflow, rights, batch generation, and support expectations are ready.

## 5. Segment comparison

| Segment | Core job | Urgency | Repeat use | Emotional value | Willingness-to-pay hypothesis | Initial priority |
|---|---|---:|---:|---:|---|---|
| Social identity creator | Make a distinctive avatar/PFP | Medium | Medium | Medium | Low-to-medium one-time purchase | 1 |
| Pet parent | Make a cute or meaningful pet keepsake | Medium-to-high | Medium | High | Medium one-time purchase | 2 |
| Couple/friend group | Create a shared visual or gift | High around occasions | Medium | High | Medium-to-high bundle purchase | 3 |
| Gift buyer | Buy/send a personal visual quickly | High | Low-to-medium | High | Medium-to-high one-time purchase | 4 |
| Micro-creator/small business | Produce recurring branded visual assets | Medium | High | Medium | High pack/subscription potential | 5 |
| Organizer/educator | Produce a group/event set | Deadline-driven | Project-based | Medium | High bulk-order potential | Later |

## 6. Customer journey

### Stage 1 — Trigger

The customer sees a trend, receives an invitation, has an occasion, or opens a photo gallery and thinks, “I want to make something from this.”

**Best entry points:**

- `photo to cartoon`
- `ai cartoon generator`
- `cartoon pfp`
- `profile picture cartoon`
- `pet cartoon`
- `couple avatar`
- Social posts and creator examples
- Gift and seasonal content

### Stage 2 — Evaluation

The customer asks:

- Will it look like the person or pet?
- Is it easy and fast?
- Do I need to install anything?
- Is there a free first result?
- Is my photo private?
- Can I download and share it?
- Can I get another version if the first one is wrong?

The page must answer these questions before forcing a sign-in whenever possible.

### Stage 3 — First success

The activation event is not account creation. It is:

> **A user sees a generated result they would actually send to another person or use as a profile image.**

Track:

- Photo attached or prompt submitted.
- Generation started.
- Generation succeeded.
- Result saved/downloaded/shared.
- Result viewed again within seven days.
- Second generation requested.

### Stage 4 — Monetisation moment

The strongest payment moments are:

- The user wants another attempt.
- The user wants multiple styles or moods.
- The user has a second person/pet/photo.
- The user needs a gift or event output.
- The user wants higher resolution, a clean download, or more variants.
- The user wants recurring content or a consistent character.

### Stage 5 — Retention

Retention should come from new creative reasons, not artificial limits:

- Seasonal packs.
- Birthday and occasion prompts.
- New moods and expressions.
- Couple/friend sets.
- Pet series.
- Sticker packs.
- Monthly creator drops.
- Saved characters and reusable references.

## 7. Revenue opportunities

The opportunities below are hypotheses to validate after measuring activation, repeat generation, and credit consumption.

### Opportunity 1 — One-time credit packs

**Best for:** Social identity creators, pet parents, couple users, gift buyers
**Why it fits:** A customer often has an immediate, bounded job and does not want a subscription.

Possible test structure:

- Starter pack: enough credits for a few attempts.
- Creator pack: enough for several styles, people, or poses.
- Occasion pack: themed credits plus prompts/examples for a specific event.

**Test pricing bands, not final prices:**

- Low-friction: approximately `$4–$7`.
- Standard: approximately `$9–$15`.
- Larger bundle: approximately `$19–$29`.

These are product experiments, not validated prices. Set final prices only after including PicX cost, payment fees, refunds, taxes, and support cost.

### Opportunity 2 — Subscription for repeat creators

**Best for:** Micro-creators, community owners, high-frequency social users
**Why it fits:** A repeat user values a predictable monthly allowance and saved creative context.

Potential benefits:

- Monthly credit grant.
- Lower effective cost per generation.
- Priority processing, only if the infrastructure supports it.
- Larger saved-character/reference allowance.
- Access to premium seasonal or creator skills.
- Commercial-use terms, only with a defined license.

Do not launch a subscription simply because subscriptions are familiar. First prove that a meaningful cohort generates in at least two or three separate weeks per month.

### Opportunity 3 — Premium occasion packs

**Best for:** Gift buyers, couples, families, pet parents
**Examples:**

- Birthday doodle pack.
- Anniversary couple pack.
- New-pet pack.
- Holiday sticker pack.
- Graduation or friendship pack.
- Memorial/keepsake pack with careful, respectful language.

The pack can combine credits, curated prompts, example styles, and a clear output format. It should not imply physical delivery unless fulfillment exists.

### Opportunity 4 — Creator and small-business packs

**Best for:** Micro-creators, streamers, newsletters, small brands, community managers
**Potential benefits:**

- More generations per month.
- Reusable character/reference workflows.
- Batch poses and expression sets once variants exist.
- Transparent commercial-use license.
- Export formats suitable for social and community use.
- Brand or mascot onboarding.

This is likely the strongest long-term revenue opportunity, but it depends on character consistency, export quality, usage rights, and reliable generation.

### Opportunity 5 — Digital gift/export upgrades

**Best for:** Gift buyers and occasion users
**Potential upgrades:**

- Higher-resolution download.
- Transparent-background PNG where supported.
- Multi-image bundle.
- Printable layout where technically supported.
- Multiple aspect ratios for social, wallpaper, and messaging.
- A downloadable gift card or share page.

Every upgrade must describe the actual file and resolution. Do not charge for a “print-ready” promise until print dimensions and quality are verified.

### Opportunity 6 — Physical merchandise or print fulfillment

**Best for:** Gift buyers, pet parents, couples, event organizers
**Examples:** stickers, cards, prints, mugs, apparel, phone cases.

**Recommendation:** Treat this as a later partnership or fulfillment experiment, not the first revenue path. It introduces shipping, refunds, taxes, production quality, customer support, and geographic constraints.

### Opportunity 7 — Bulk/event orders

**Best for:** Clubs, schools, online communities, events, small campaigns
**Potential offer:** a fixed number of themed outputs, a private upload window, moderation, and a downloadable gallery.

Validate with manual concierge pilots before building a self-serve enterprise surface.

### Opportunity 8 — Referral and creator partnerships

**Best for:** Pet creators, relationship creators, art educators, community moderators, gift-content creators
**Potential model:** tracked referral link or creator code with a credit reward or revenue share.

Do not pay for low-quality traffic. Optimise for successful generation, share/download rate, and paid conversion.

## 8. Revenue priority matrix

| Opportunity | Customer fit | Repeat potential | Build effort | Operational risk | Recommendation |
|---|---:|---:|---:|---:|---|
| One-time credit packs | High | Medium | Medium | Medium | Build first when Stripe phase starts |
| Occasion packs | High | Medium | Low-to-medium | Low | Test as curated credit/style bundles |
| Creator packs | High for creators | High | High | Medium | Validate after consistency improves |
| Subscription | Medium initially | High | Medium | Medium | Launch only after repeat-use evidence |
| Download/export upgrades | Medium-to-high | Low | Medium | Medium | Test with real output formats |
| Physical merchandise | Medium | Low | High | High | Later partnership/concierge test |
| Bulk/event orders | Medium | Project-based | High | High | Manual pilot first |
| Referrals | Medium | Variable | Low | Medium | Add after conversion is measurable |

## 9. Illustrative revenue scenarios

These are simple planning examples, not forecasts. They exclude payment fees, taxes, refunds, PicX costs, support, and acquisition costs.

### One-time pack example

- 1,000 monthly active users.
- 5% purchase a `$9.99` credit pack.
- Gross monthly sales: `50 × $9.99 = $499.50`.

### Repeat-user example

- 10,000 monthly active users.
- 3% purchase a `$9.99` pack.
- Gross monthly sales: `300 × $9.99 = $2,997`.

### Subscription example

- 5,000 monthly active users.
- 2% subscribe at a hypothetical `$12.99/month`.
- Gross monthly recurring revenue: `100 × $12.99 = $1,299`.

### Creator-pack example

- 100 paying creators.
- Hypothetical average monthly revenue of `$29` per creator.
- Gross monthly revenue: `$2,900`.

The key business metric is not gross sales alone. For each offer calculate:

```text
Contribution margin per customer
= price
- payment fees
- expected PicX generation cost
- refunds/failed-generation cost
- support and fulfillment cost
```

Then compare it with customer acquisition cost and payback time.

## 10. Willingness-to-pay hypotheses

| Customer behavior | Likely offer | Price sensitivity | What must be true |
|---|---|---|---|
| Wants one profile picture | Small credit pack | High | First result is fast and good |
| Wants several styles | Standard credit pack | Medium | Regeneration feels valuable |
| Needs a birthday/anniversary gift | Occasion pack | Medium | Output is downloadable and shareable |
| Wants pet keepsake | Premium one-time pack | Medium | Pet likeness and quality are reliable |
| Posts content weekly | Creator subscription/pack | Lower | Character consistency and rights exist |
| Runs a community event | Bulk order | Lower if deadline is urgent | Batch flow and support are reliable |

### Pricing research questions

Ask or test:

1. Would you pay to make another version after seeing the first result?
2. Would you rather buy three generations or receive a monthly allowance?
3. Is the main value the image, the style, the speed, or the convenience?
4. Would you pay more for a pet/couple/gift pack than for a single avatar?
5. Do you need a transparent PNG, larger download, multiple aspect ratios, or print dimensions?
6. Would you use Doodle AI monthly if your character could stay consistent?
7. What would make you trust uploading a personal photo?

## 11. Acquisition strategy by ICP

### Search and content

Use the live SEO findings to build intent-specific pages:

- `photo to cartoon` — 4,400 US monthly volume.
- `ai cartoon generator` — 4,400 and a captured Google AI Overview.
- `profile picture cartoon` — 1,900 with very low paid competition index.
- `cartoon pfp` — 2,900.
- `pet cartoon` — 880 with low competition index.
- `couple avatar` — 390 with low paid competition.

The India comparison showed especially strong demand for `photo to sticker` and `ai portrait generator`, but these should not become launch priorities unless the product and regional experience support them.

### Social distribution

Live X behavior is documented in [social.md](./social.md). Use that report before inventing a content calendar.

What people actually copy on X today:

- Exact prompts under a result (“prompt in thread,” “DM me STICKER”).
- One-photo to many-vibe grids.
- Hand-drawn doodle PFPs, currently attributed to people like @mannay / @kevin_t_ngo and to [lazyavatar.com](https://lazyavatar.com) — a seed-based API, not a photo-likeness studio.
- ChatGPT Images stickers (transparent, iMessage/WhatsApp) as of 2026-08-24.
- Grok Imagine as the in-app cartoon/edit path on X.

Doodle AI posts should therefore be:

- Before/after stills and short videos of **real** Doodle AI outputs.
- “Turn my photo into…” plus the skill name and the prompt.
- Collage / mood-caption grids (the product already makes these).
- Sticker-*sheet* examples with honest captions, never implied WhatsApp export.
- Saved-character / several-moods examples once a public figure is willing to show them.
- Shareable output pages with Doodle AI attribution only where the user consents.

There is no official doodleai.art X account. An unrelated `@doodleais` exists; do not treat it as owned.

### Partnerships

- Pet creators and rescue communities.
- Couple and wedding creators.
- Discord/community moderators.
- Newsletter and personal-brand creators.
- Gift guides and occasion-content publishers.
- Art and design educators for workshops.

### Product-led growth

- Shareable result page with privacy controls.
- “Make another version” CTA.
- “Try a different skill” CTA.
- Invite a friend to create a matching avatar.
- Seasonal skill cards.
- Saved character/reference workflow when quality is ready.

## 12. Funnel and event taxonomy

Track these events consistently:

| Funnel stage | Event | Meaning |
|---|---|---|
| Discovery | `landing_view` | User reached a public product or content page |
| Intent | `prompt_started` | User began typing or selected a skill |
| Intent | `photo_attached` | User attached a reference photo |
| Activation | `auth_completed` | User completed required sign-in |
| Activation | `generation_started` | Server accepted a generation request |
| Activation | `generation_succeeded` | A usable output returned |
| Value | `result_saved` | User saved to moodboard/account |
| Value | `result_downloaded` | User downloaded the output |
| Value | `result_shared` | User used a share action |
| Retention | `second_generation` | User generated again in the same or later session |
| Monetisation | `pricing_viewed` | User viewed a paid offer |
| Monetisation | `checkout_started` | User began payment, once Stripe exists |
| Monetisation | `purchase_completed` | User successfully bought credits |
| Retention | `return_generation_7d` | User generated again within seven days |

### Core metrics

- **Activation rate:** successful generations / unique visitors who started a prompt.
- **Share-worthy rate:** saves + downloads + shares / successful generations.
- **Second-generation rate:** users with two or more generations / users with one generation.
- **Paid conversion:** purchasers / activated users.
- **Revenue per activated user:** gross revenue / activated users.
- **Contribution margin per generation:** revenue allocation minus provider and transaction costs.
- **Customer lifetime value:** expected contribution margin over the customer's active period.
- **CAC payback:** acquisition cost divided by monthly contribution margin.

## 13. Validation experiments

### Experiment 1 — Avatar landing page

**Hypothesis:** A dedicated cartoon PFP page converts better than sending all traffic to the generic homepage.

- Build `/cartoon-profile-picture/`.
- Target `profile picture cartoon`, `cartoon pfp`, and `ai profile picture`.
- Use real examples and an upload CTA.
- Measure prompt starts, sign-ins, generation success, and downloads.

**Pass signal:** materially higher generation-start rate than the generic homepage for the same traffic source.

### Experiment 2 — Pet landing page

**Hypothesis:** Pet-specific messaging increases emotional engagement and paid intent.

- Build `/pet-cartoon/` only with a real pet-capable output.
- Show dog, cat, and multi-pet examples.
- Test “cute profile picture” against “personalized pet gift.”

**Pass signal:** higher share/download rate or higher willingness to pay than the general avatar flow.

### Experiment 3 — Credit-pack price test

**Hypothesis:** Users prefer a small one-time pack over an early subscription.

- Present a non-functional pricing prototype or wait until Stripe test mode is ready.
- Test three pack sizes.
- Measure offer click, checkout start, purchase completion, and repeat purchase.

**Pass signal:** users purchase without requiring a subscription explanation and contribution margin remains positive.

### Experiment 4 — Occasion pack

**Hypothesis:** A specific occasion converts better than a generic “AI image” offer.

- Test birthday, pet, and couple packs separately.
- Use a deadline-oriented page and examples.
- Do not imply physical delivery.

**Pass signal:** higher CTA-to-generation rate and higher purchase intent near the relevant occasion.

### Experiment 5 — Creator repeat-use test

**Hypothesis:** Consistent character workflows create subscription-worthy demand.

- Recruit 10–20 micro-creators.
- Give each a defined character/reference and a weekly content task.
- Measure repeat generations, failures, edit requests, and export needs.

**Pass signal:** creators return weekly and request more credits, variants, or commercial rights.

## 14. Anti-ICP and disqualification rules

Doodle AI should not optimise for these customers first:

- Users seeking photorealistic professional headshots.
- Users requiring advanced Photoshop-style editing.
- Users expecting unlimited free generation.
- Users needing guaranteed commercial licensing before terms exist.
- Users requiring batch generation before batch workflows are implemented.
- Users expecting physical merchandise delivery before fulfillment exists.
- Enterprise buyers requiring SSO, procurement, SLAs, audit logs, or private deployment.
- Users uploading photos they do not have permission to use.
- Requests that conflict with the product's safety, privacy, or acceptable-use policy.

Disqualifying the wrong use case is better than acquiring a user who will be disappointed by a mismatch.

## 15. Messaging framework

### Core promise

> Turn a photo or idea into a playful doodle you will actually want to share.

### Functional proof

- Conversational prompt instead of a complicated editor.
- Photo upload plus natural-language direction.
- Multiple skills for avatars, collages, stickers, moods, gifts, and future modes.
- Server-owned generation connection and account credits.
- Save and sync for signed-in work.

### Emotional outcomes

- “That looks like me.”
- “That is exactly my pet.”
- “We have a matching picture now.”
- “I made a thoughtful gift in minutes.”
- “My community has a visual identity.”

### Trust proof

- Explain account requirements before upload.
- Explain credits plainly.
- State what is live and what is planned.
- Explain provider credentials remain server-side.
- Show real output examples and limitations.
- Do not hide failed-generation or refund behavior.

## 16. Recommended sequence

### Now

1. Put real examples and answer copy on the existing `/skills/normal/` and `/skills/` pages; treat keyword landing pages as a second step.
2. Validate the first-generation and second-generation funnel.
3. Add clear credit copy: 5 signup credits, 1 credit per generation, refunds on failure.
4. Create an official X account and publish the prompt-plus-result posts in [social.md](./social.md).
5. Measure which output users save, download, share, or regenerate.

### Next commercial milestone

6. Implement Stripe test-mode credit packs with idempotent webhooks.
7. Launch one small credit pack and one standard pack.
8. Keep subscriptions hidden until repeat-use evidence exists.
9. Add an occasion-pack experiment without building physical fulfillment.
10. Recalculate margins using actual PicX cost and failed-generation rates.

### Later

11. Build creator packs after character consistency improves.
12. Pilot manual bulk/event orders.
13. Explore print-on-demand only after digital gift behavior is proven.
14. Add referral tracking after organic/social conversion can be measured.

## 17. Decision checklist before charging money

- [ ] The customer can see a successful result before being asked to buy.
- [ ] Credit cost is visible before generation.
- [ ] Failed generations refund correctly.
- [ ] Stripe webhook events are idempotent.
- [ ] The user can see purchase history and current balance.
- [ ] Refund and cancellation language is clear.
- [ ] Taxes and payment fees are accounted for.
- [ ] PicX generation cost is known for each skill.
- [ ] Commercial-use rights are written clearly if offered.
- [ ] Output resolution and file type match the offer.
- [ ] Support can handle failed or disappointing outputs.
- [ ] The paid offer does not promise unavailable variants, batch generation, or physical delivery.

## 18. Final recommendation

Doodle AI should monetise **personalized emotional outcomes**, not generic AI access.

The first customer to win is the person who says:

> “I have a photo, I want something fun and personal, and I want it right now.”

The first offer should be a small, transparent credit pack that lets that person make another version, create a second person or pet, or finish an occasion gift. Once repeat creators prove they need Doodle AI every week, introduce creator packs or subscriptions. Treat physical products, enterprise plans, and broad professional-image markets as later opportunities rather than immediate distractions.
