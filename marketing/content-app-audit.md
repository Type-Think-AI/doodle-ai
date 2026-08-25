# Doodle AI Editorial Compatibility Update

**Date:** 2026-08-25
**Scope:** Correct published and planned Doodle AI claims against a verified implementation audit. Distinguish code-backed foundation from a user-facing production workflow. No unverified metrics, customer names, or implied product completeness.

---

## 1. Audit summary

Doodle AI currently has a working **Better Auth organization layer**. On signup, every user receives a **personal organization**. Organization configuration allows **up to 5 organizations** and **25 members**. Defined roles are **owner**, **producer**, **artist**, **reviewer**, and **client**. Sessions carry an **active organization**. `requireOrg` rechecks membership and permissions.

In the API, **threads/messages**, **characters as shared references**, **moodboards**, and **generation/credit accounting** are **organization-scoped**. Credits are **pooled per organization**. A generation costs **1 credit**. Signup grants **5 credits**. Failed generations **refund**. Organization **limits and rate caps** exist. `GET /api/v1/me` returns the **active organization**, **organizations**, **role**, **balance**, and **member count**.

This is a **backend/API foundation plus shared data behavior**, not a finished enterprise UI. The audited files do **not** visibly expose a complete team switcher or a polished B2B project workspace.

The database schema contains **projects**, **assets**, **share links**, **batch jobs/items**, **review states**, and **access-control statements**. Generation can attach a generated asset when a `projectId` is supplied. No dedicated `/api/v1/projects`, `/assets`, `/batches`, or public review route was found in the audited page tree. Treat **project / review / share / batch** as **foundation or partial integration**, not fully verified end-to-end product features.

**Current runnable image skills:** normal doodle avatar, close-up collage, full-body collage, surprise, stickers, mood-captions, and gift.

**Not live:** Stripe checkout/subscriptions, video, timeline/animatic, C2PA, commercial licensing, physical fulfillment, and guaranteed character continuity.

---

## 2. Capability matrix

| Capability | Status | Audit basis |
|---|---|---|
| Better Auth organization layer | **Current** | Implemented organization layer |
| Personal organization created on signup | **Current** | Every user gets a personal organization |
| Organization limits: 5 orgs, 25 members | **Current** | Organization config |
| Roles: owner, producer, artist, reviewer, client | **Current** | Role model in organization layer |
| Session active organization | **Current** | Sessions carry an active organization |
| Membership/permission recheck (`requireOrg`) | **Current** | Rechecks membership and permissions |
| Organization-scoped threads/messages | **Current** | API scoping |
| Organization-scoped characters (shared references) | **Current** | API scoping |
| Organization-scoped moodboards | **Current** | API scoping |
| Organization-scoped generation and credit accounting | **Current** | API scoping |
| Pooled organization credits | **Current** | Credits pooled per organization |
| Generation cost: 1 credit | **Current** | Credit accounting |
| Signup grant: 5 credits | **Current** | Credit grant |
| Failed-generation refund | **Current** | Credit accounting |
| Organization limits and rate caps | **Current** | Org limits/rate caps exist |
| `GET /api/v1/me` (active org, orgs, role, balance, member count) | **Current** | Endpoint returns these fields |
| Shared data across members of the active organization | **Current** (API/data) | Organization-scoped resources |
| Team switcher / polished B2B project workspace UI | **Partial foundation** | Not visibly exposed in audited files; do not describe as finished enterprise UI |
| Projects (schema) | **Partial foundation** | Schema present; no dedicated `/api/v1/projects` in audited page tree |
| Attach generated asset when `projectId` is supplied | **Partial foundation** | Generation can attach an asset; not a verified projects product surface |
| Assets | **Partial foundation** | Schema present; no dedicated `/assets` route in audited page tree |
| Share links | **Partial foundation** | Schema present; not a verified public share product |
| Batch jobs/items | **Partial foundation** | Schema present; no dedicated `/batches` route in audited page tree |
| Review states / public review | **Partial foundation** | Schema and access-control statements present; no public review route in audited page tree |
| Access-control statements | **Partial foundation** | Present in schema; not a verified end-to-end review/share workflow |
| Image skill: normal doodle avatar | **Current** | Runnable image skill |
| Image skill: close-up collage | **Current** | Runnable image skill |
| Image skill: full-body collage | **Current** | Runnable image skill |
| Image skill: surprise | **Current** | Runnable image skill |
| Image skill: stickers | **Current** | Runnable image skill |
| Image skill: mood-captions | **Current** | Runnable image skill |
| Image skill: gift | **Current** | Runnable image skill |
| Stripe checkout / subscriptions | **Not live** | Not live in this audit |
| Video | **Not live** | Not live in this audit |
| Timeline / animatic | **Not live** | Not live in this audit |
| C2PA | **Not live** | Not live in this audit |
| Commercial licensing | **Not live** | Not live in this audit |
| Physical fulfillment | **Not live** | Not live in this audit |
| Guaranteed character continuity | **Not live** | Not live in this audit |

---

## 3. Corrections to article-format planning

Plan articles against **what the product currently runs**, not against schema names, roadmap language, or implied studio workflow.

**Safe to plan as current product:**

- Consumer how-tos for the seven runnable image skills only: **normal doodle avatar**, **close-up collage**, **full-body collage**, **surprise**, **stickers**, **mood-captions**, and **gift**.
- Credit behavior that is implemented: **1 credit per generation**, **5-credit signup grant**, **failed generations refund**, **credits pooled per organization**.
- Organization facts that are implemented in the API: personal org on signup, active organization on the session, roles listed above, `requireOrg` membership/permission recheck, and `GET /api/v1/me` fields.
- Shared references that are organization-scoped in the API: **threads/messages**, **characters**, **moodboards**, and generation/credit accounting.

**Do not plan as finished product articles:**

- Team switcher, org picker, or polished B2B project workspace UI.
- End-to-end **projects**, **assets library**, **share links**, **batch jobs**, or **review** workflows. These exist as schema and/or partial integration. No dedicated `/api/v1/projects`, `/assets`, `/batches`, or public review route was found in the audited page tree.
- Any article that treats attaching a generated asset via `projectId` as a complete projects feature.

**Do not plan, preview, or imply as available:**

- Stripe checkout or subscriptions
- Video
- Timeline / animatic
- C2PA
- Commercial licensing
- Physical fulfillment
- Guaranteed character continuity

**Format rule:** If a piece needs a project, review round, share link, batch queue, billing flow, video output, or licensing claim, it is either **out of scope** or must be labeled as **foundation / not a verified user-facing workflow**. Do not use those topics as the spine of a how-to.

---

## 4. Corrections to B2B marketing claims

The organization layer is real. A finished B2B product surface is not verified.

**Accurate claims:**

- Doodle AI has a Better Auth organization layer.
- Every user gets a personal organization on signup.
- Configuration allows up to **5 organizations** and **25 members**.
- Roles are **owner**, **producer**, **artist**, **reviewer**, and **client**.
- Sessions carry an active organization; `requireOrg` rechecks membership and permissions.
- Threads/messages, characters as shared references, moodboards, and generation/credit accounting are organization-scoped in the API.
- Credits are pooled per organization. Generation costs 1 credit. Signup grant is 5 credits. Failed generations refund. Organization limits and rate caps exist.
- `GET /api/v1/me` returns the active organization, organizations, role, balance, and member count.

**Required framing:**

- Describe the team layer as a **working backend/API foundation plus shared data behavior**.
- Do **not** describe a complete team switcher, polished B2B project workspace, or enterprise UI. Those were not visibly exposed in the audited files.

**Disallowed or overstated claims:**

- “Team workspace,” “client review portal,” “shared project hub,” “asset library,” “batch production pipeline,” or “public review links” as live product.
- Projects, assets, share links, batch jobs/items, review states, and access-control statements as shipped end-to-end features. They are **foundation or partial integration**.
- Seat-based billing, Stripe checkout, or subscriptions.
- Commercial licensing, C2PA provenance, physical fulfillment, video, timeline/animatic, or guaranteed character continuity.
- Any implication that reviewer or client roles currently map to a complete review UI or client-facing approval flow.

**Replacement language:**

- Use “organization-scoped API and shared data” instead of “B2B workspace.”
- Use “roles exist in the organization layer” instead of “role-based studio workflow.”
- Use “schema/foundation for projects, assets, shares, batches, and review” instead of “project management,” “review and approval,” or “batch production.”
- Use “pooled organization credits” instead of “team billing” or “subscription plans.”

---

## 5. Corrections required in the existing article *From Brief to Concept Board*

Treat the article as a **concept-to-image** piece bounded by current image skills and organization-scoped moodboards. Remove or rewrite any language that implies a full brief-to-review production pipeline.

**Keep only if tied to verified behavior:**

- Moodboards as organization-scoped data in the API.
- Characters as shared references that are organization-scoped.
- Generation against the runnable image skills listed above.
- Credit cost, signup grant, refund on failure, and pooled organization credits.
- Active organization on the session, with membership/permission rechecked by `requireOrg`.

**Rewrite or remove:**

- Any sequence that presents **brief → project → board → review → share → batch** as a live path. Projects, share links, batch jobs/items, review states, and access-control statements are schema/foundation. Generation may attach a generated asset when a `projectId` is supplied; that is **not** a verified projects product.
- Any mention of dedicated project, asset, batch, or public review routes. None of `/api/v1/projects`, `/assets`, `/batches`, or a public review route was found in the audited page tree.
- Any UI walkthrough of a team switcher, client workspace, or polished B2B project workspace.
- Any claim that reviewer or client roles currently operate a review board, approval queue, or share-link review.
- Any implication that a moodboard is a finished “concept board product” beyond organization-scoped moodboard data.

**Do not introduce:**

- Video, timeline/animatic, C2PA, commercial licensing, physical fulfillment, Stripe/subscriptions, or guaranteed character continuity.

**Corrected through-line for the article:**

1. User signs up and receives a personal organization and **5 credits**.
2. Session uses an active organization; members share organization-scoped threads, characters, moodboards, and credit balance, subject to org limits and rate caps.
3. User generates images with a current skill. Each generation costs **1 credit**. Failed generations refund.
4. Stop at generated images and organization-scoped moodboard/character references. Do not continue into project management, public review, share links, or batch production as if those were verified product surfaces.

---

## 6. Content workflow for multiple formats

Use one source of truth: the matrix in section 2. Every format must name **current** capabilities, mark **partial foundation** as unverified for end-to-end use, and omit **not live** features.

### Consumer how-to

**Purpose:** Teach one current image skill.

**Include:**

- Only one of: normal doodle avatar, close-up collage, full-body collage, surprise, stickers, mood-captions, gift.
- Credit facts: 1 credit per generation, 5-credit signup grant, refund on failure.
- If mentioning accounts: personal organization on signup; credits are pooled on the organization.

**Exclude:**

- Team workspace UI, projects, review, share links, batches, billing, video, licensing, fulfillment, C2PA, continuity guarantees.

**Close:** Tell the reader which skill was used and that other skills are separate how-tos.

### AEO answer

**Purpose:** Direct answers to factual questions.

**Allowed answers (state only these):**

- Organization layer: Better Auth; personal org on signup; up to 5 organizations and 25 members; roles owner, producer, artist, reviewer, client; session active organization; `requireOrg` rechecks membership and permissions.
- Scoped in the API: threads/messages, characters as shared references, moodboards, generation/credit accounting.
- Credits: pooled per organization; 1 credit per generation; 5-credit signup grant; failed generations refund; org limits/rate caps exist.
- `GET /api/v1/me` returns active organization, organizations, role, balance, and member count.
- Current image skills: the seven listed above.

**Required negatives when the question implies them:**

- Team switcher / polished B2B UI: not visibly exposed in the audited files; backend/API foundation plus shared data behavior only.
- Projects, assets, share links, batches, public review: foundation or partial integration; not fully verified end-to-end.
- Stripe checkout/subscriptions, video, timeline/animatic, C2PA, commercial licensing, physical fulfillment, guaranteed character continuity: not live.

**Do not invent** counts, conversion rates, customers, or availability dates.

### Prompt library

**Purpose:** Prompts for current image skills only.

**Rules:**

- Tag every prompt with exactly one current skill.
- Do not attach project, review, share, batch, video, timeline, licensing, or fulfillment instructions.
- Do not claim a prompt will preserve a character across generations. Guaranteed character continuity is **not live**. Characters may be described as organization-scoped shared references, not as a continuity guarantee.
- Do not imply mood-captions, stickers, collages, or gift outputs are licensed for commercial use.

### B2B workflow

**Purpose:** Describe the organization layer without presenting a finished studio product.

**Lead with foundation language:**

- Working backend/API foundation plus shared data behavior.
- Not a finished enterprise UI.
- No complete team switcher or polished B2B project workspace was visibly exposed in the audited files.

**May document:**

- Signup → personal organization.
- Caps: 5 organizations, 25 members.
- Roles: owner, producer, artist, reviewer, client — as organization roles, not as a verified review UI.
- Active organization on the session; `requireOrg` membership/permission recheck.
- Organization-scoped threads, characters, moodboards, generation, and pooled credits.
- `GET /api/v1/me` fields.

**Must label as foundation / partial integration, not a walkthrough:**

- Projects, assets, share links, batch jobs/items, review states, access-control statements.
- Asset attachment when `projectId` is supplied.
- Absence of dedicated `/api/v1/projects`, `/assets`, `/batches`, and public review routes in the audited page tree.

**Must not sell:** subscriptions, commercial licensing, C2PA, video/animatic, physical fulfillment, or guaranteed continuity.

### Intent clarifier

**Purpose:** Route a request to the correct format and stop over-claiming.

| If the request is… | Route to | Bound it with |
|---|---|---|
| How to make a doodle, collage, sticker, caption, surprise, or gift image | Consumer how-to | Named current skill only |
| What orgs, roles, credits, or `/me` return | AEO answer | Exact audit facts |
| Example prompts | Prompt library | Current skills; no continuity or license claims |
| Team, client, studio, or “how our org works” | B2B workflow | Backend/API foundation + shared data; not enterprise UI |
| Project, asset library, share link, batch, or review portal | Intent clarifier → decline as live how-to | Foundation/partial integration only |
| Video, animatic, C2PA, licensing, print/fulfillment, checkout/subscription, guaranteed character match | Intent clarifier → not live | Do not draft product copy |

**Clarifier copy pattern:**

- Current: state the verified behavior.
- Partial foundation: name the schema or partial hook and state that it is not a verified end-to-end product feature.
- Not live: say it is not live. Do not preview it as if it were shipping in the article.

**Editorial gate before publish:**

1. Does every product claim map to **Current** or explicitly **Partial foundation**?
2. Are projects, assets, shares, batches, and review described as unverified end-to-end?
3. Is the team layer described as backend/API foundation plus shared data, not a finished B2B UI?
4. Are Stripe, video, timeline/animatic, C2PA, commercial licensing, physical fulfillment, and guaranteed character continuity absent unless marked **not live**?
5. Are there no invented metrics or customer names?
