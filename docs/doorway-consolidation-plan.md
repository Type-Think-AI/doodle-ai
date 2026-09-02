# Doorway consolidation plan — the doodle/cartoon converter cluster

**Lane 5, wave 4. This file recommends and sequences; it executes nothing.**
No code, no deletions, no redirects are performed here. It gives a per-page verdict,
the exact redirect destination, the volume/intent that justifies each call, and what
the surviving hub must absorb so a merge does not shed ranking. It then specifies the
shape of the anime cluster that gets built *after* this cleanup, so we do not compound
the mistake at a larger scale.

Companion docs (already diagnose this in writing):
`docs/tool-pages-plan.md` (names 16 doorway-risk pages),
`docs/seo-keyword-pages-spec.md` ("unique body per URL. No template with one noun
swapped."), `docs/anime-positioning.md` §3 (no anime pages ship until this is
resolved).

---

## 0. Why now, and against what standard

Every page in this cluster is a real Astro article at
`src/content/articles/<slug>/index.md`, served by `src/pages/[...path].astro` at the
root URL `/<slug>/`. There is no `/tools/` prefix. A redirect therefore means a
`301` from `/<slug>/` to the hub URL plus removal of the source file (a deletion
call — sequenced here, executed by the owner).

**Google's current standard — and it is stricter-worded than the 2015 post the old
docs cited.** The live
[Spam Policies for Google Web Search](https://developers.google.com/search/docs/essentials/spam-policies)
now lists this under **"Doorway abuse"** (the section was renamed from "doorway
pages"). Its own examples name this cluster almost exactly:

- "Creating substantially similar pages that are closer to search results than a
  clearly defined, browseable hierarchy."
- "Generating pages to funnel visitors into the actual usable or relevant portion of
  a site."

(Content rephrased from Google's spam-policy documentation for licensing compliance.)

The cluster below is 30+ URLs, all bound to **one of two skills** (`normal`, or
`surprise` for the text-to-fiction pair), each a real composer that funnels into the
same `/c/[id]` studio, differing mostly by which synonym of "doodle generator" leads
the H1. That is the "substantially similar pages closer to search results than a
browseable hierarchy" shape verbatim. The fix is Google's own recommended one:
**one strong page per genuine intent, weak synonyms folded/redirected into it.**

I verified skill binding and body length on disk for every page below
(`grep '^skill:'` + word count of the rendered body), and read the full body of the
keep/borderline candidates rather than trusting the workbook. Volumes are from the
in-repo Semrush workbook (2026-08-29) as transcribed in `docs/tool-pages-plan.md` and
`docs/seo-keyword-pages-spec.md`; I did **not** invent any, and I flag below where I
could not independently re-verify a number (live Semrush/GSC access is not available
from this lane — see §6).

---

## 1. The cluster, mapped to intent

There are four genuine intents hiding under ~30 near-duplicate URLs:

| Intent | The job the searcher wants | Canonical hub | Skill |
|---|---|---|---|
| **A. Photo → doodle (core converter)** | "I have a photo, redraw it as a doodle" | `/photo-to-doodle/` | `normal` |
| **B. Generic "doodle generator/maker"** | brand-agnostic tool query, may or may not have a photo | `/doodle-generator/` | `normal` |
| **C. Text → fictional doodle (no photo)** | "invent a doodle from words" | `/text-to-doodle/` | `surprise` |
| **D. Cartoon converter (separate, huge)** | "photo to cartoon" — different look, different head demand | `/photo-to-cartoon/` | `normal` |

Intent D (the cartoon cluster) is **out of scope for consolidation** — it carries the
site's biggest numbers (`photo to cartoon` IN 60,500) and every page there has a
distinct qualifier (free / app / online / profile-picture) that maps to real,
separable search demand. It is handled by `docs/tool-pages-plan.md` Batch 3 as a
*conversion* (flip to tool layout), not a merge. I note it here only so the boundary
is explicit: **do not fold cartoon pages into doodle hubs.** The doorway problem is
inside intents A–C.

---

## 2. Verdicts — the doodle-generator/maker doorway cluster

Legend: **KEEP** = distinct intent, own URL survives. **MERGE** = fold its unique
angle into the hub as an H2, then redirect. **REDIRECT** = 301 to hub, nothing worth
absorbing. All source files are `src/content/articles/<slug>/index.md`.

### 2a. KEEP — the four hubs and the genuinely-distinct pages

| Slug (file `src/content/articles/<slug>/index.md`) | Skill | US / IN | Why it earns its own URL |
|---|---|---:|---|
| `photo-to-doodle` | normal | 20 / 20 | **Hub A.** Exact-match core converter, best body in the set (790 words), the honest "what it is / is not" page. Everything in intent A points here. |
| `doodle-generator` | normal | 170 / 110 | **Hub B.** Highest-volume brand-agnostic tool phrase in the doodle cluster; SERP #1 is ilus.ai (a tool), so a tool page is the right answer. Redirect target for the generic synonyms. |
| `text-to-doodle` | surprise | 20 / — | **Hub C.** Different job (no photo, invents fiction via `surprise`). Redirecting this into a photo-required page would be a genuine intent mismatch. |
| `image-to-doodle` | normal | 20 / 90 | KEEP. Real IN volume; distinct disambiguation angle (saved images / exported portraits vs camera pictures) written into the body. |
| `picture-to-doodle` | normal | — / 140 | KEEP. **Highest IN volume** of the doodle-converter phrases; body is disambiguated for camera-roll / phone-browser. Losing this would be the single biggest traffic risk in the cluster (see §4). |
| `doodle-maker` | normal | 320 / 590 | KEEP. Highest combined volume of any "maker" phrase, and the body does real SERP work disambiguating from the whiteboard-video `doodlemaker.com`. Distinct searcher confusion to resolve = distinct page. |
| `doodle-character-generator` | surprise | — / — | KEEP (into intent C). Binds to `surprise`, draws a fictional *character* from text — a different output than a photo redraw. Low/again-unverified volume; keep because the intent is distinct, not because the number is big. |

**7 KEEP.**

### 2b. MERGE — fold the unique angle into a hub, then 301

These carry one genuinely useful sentence or angle the hub should absorb before the
redirect, so the hub inherits the long-tail phrasing rather than dropping it.

| Slug | Skill | US / IN | 301 → destination | What the hub must absorb first |
|---|---|---:|---|---|
| `doodle-generator-free` | normal | 20 / ≤20* | `/doodle-generator/` | The "is it free / no card / no paywall" reassurance. Add a `### Is it free?` H2 to `/doodle-generator/` covering starter credits, 1-credit-per-run, refund-on-fail. This is the one substantive angle in the free/online/ai synonym pile — capture it once, on the hub. |
| `photo-to-doodle-converter` | normal | 20 / ≤20* | `/photo-to-doodle/` | Nothing new — but the exact "converter" wording should appear as an H2 (`### Photo to doodle converter`) on Hub A so the hub still matches that query. |
| `image-to-doodle-converter` | normal | ≤20 / 110 | `/image-to-doodle/` | The IN-110 "converter" phrasing → add it as an H2 on `/image-to-doodle/`. Do **not** redirect to `/photo-to-doodle/`; keep it inside the image-to-doodle intent it already ranks for. |
| `picture-to-doodle-converter` | normal | ≤20 / ≤20* | `/picture-to-doodle/` | "converter" H2 on `/picture-to-doodle/`. Same reasoning — stay within the picture intent. |
| `convert-photo-to-doodle` | normal | 20 / ≤20* | `/photo-to-doodle/` | Verb-first phrasing ("convert…") → one H2 on Hub A. |
| `convert-photo-to-doodle-online-free` | normal | 20 / — | `/photo-to-doodle/` | Long-tail "online free" → covered by the free-H2 absorbed above; redirect after. |
| `apps-to-doodle-on-photos` | normal | ≤20 / ≤20* | `/photo-to-doodle/` | The "app / on my phone" angle → one line in Hub A's How-to noting it runs in a phone browser, no install. |

**7 MERGE.**

### 2c. REDIRECT — pure synonym padding, nothing to absorb

Every one of these is the hub's job under a different noun. Their bodies are
structural clones (Direct answer / one example image / prompt / "same tool, different
angle" related-links / FAQ echo). Nothing unique to preserve; 301 straight to the hub.

| Slug | Skill | US / IN | 301 → destination |
|---|---|---:|---|
| `doodle-art-maker` | normal | ≤20 / ≤20* | `/doodle-generator/` |
| `doodle-art-generator` | normal | ≤20 / ≤20* | `/doodle-generator/` |
| `ai-doodle-art-generator` | normal | ≤20 / ≤20* | `/doodle-generator/` |
| `doodle-image-generator` | normal | ≤20 / ≤20* | `/doodle-generator/` |
| `doodle-drawing-generator` | normal | ≤20 / ≤20* | `/doodle-generator/` |
| `online-doodle-generator` | normal | ≤20 / ≤20* | `/doodle-generator/` |
| `doodle-generator-online` | normal | ≤20 / ≤20* | `/doodle-generator/` |
| `doodle-generator-ai` | normal | ≤20 / ≤20* | `/doodle-generator/` |
| `doodle-ai-generator` | normal | ≤20 / ≤20* | `/doodle-generator/` |
| `ai-doodle-generator-free` | normal | ≤20 / ≤20* | `/doodle-generator/` |
| `ai-doodle-maker` | normal | ≤20 / ≤20* | `/doodle-generator/` |
| `ai-doodle-generator-from-photo` | normal | ≤20 / ≤20* | `/photo-to-doodle/` |
| `doodle-generator-from-photo` | normal | ≤20 / ≤20* | `/photo-to-doodle/` |
| `make-a-doodle` | normal | 170 / 210 | `/doodle-generator/` — see §4, **verify GSC before executing** |
| `doodle-maker-online` | normal | 10 / 110 | `/doodle-maker/` |

**15 REDIRECT.**

`*` = the workbook bucket is US 20 / IN ≤20 for the 16 flagged doorway phrases; the
individual per-URL split below 20 is not resolvable from the transcribed numbers, so
I mark it `≤20` rather than invent a figure.

### 2d. Sitting-adjacent — flagged, not consolidated

| Slug | Skill | US / IN | Verdict |
|---|---|---:|---|
| `ai-doodle-generator` | normal | 90 / — | **KEEP for now.** US 90 with KD 20 is the one "ai … generator" phrase with enough volume to defend its own URL; the spec explicitly separates it from `photo-to-doodle`. Re-evaluate after 90 days of GSC data — if it draws nothing, fold into `/doodle-generator/`. |
| `hand-drawn-image-generator` | normal | ≤20 / ≤20* | **REDIRECT → `/doodle-generator/`.** Listed with the 16; no distinct intent. Added to 2c count would make 16, but I hold it here because "hand-drawn image" is arguably a broader phrase than "doodle" — low confidence. Owner's call whether it joins 2c. |

### Verdict counts

- **KEEP: 7** (2a) + `ai-doodle-generator` held in 2d = **8 pages retained.**
- **MERGE: 7** (2b) — absorb-then-301.
- **REDIRECT: 15** (2c), + `hand-drawn-image-generator` (2d) as an owner-decision 16th.

Net: **22 doorway pages → 3 hubs + 5 distinct keepers.** This matches
`docs/tool-pages-plan.md`'s "301 thirteen, keep 2–3" instinct but is more precise:
the plan there under-counted the merge tier (pages with a real angle to absorb) and
was too quick to keep `doodle-generator-free` (its own body says "same tool,
different angle" — that is a redirect, not a keep).

---

## 3. What each surviving hub must absorb (so no ranking is lost)

A 301 passes most link equity, but the *content* signals that made the thin page rank
must live on the hub or the hub will not match those queries after the merge.

**`/photo-to-doodle/` (Hub A)** must gain, as H2 sections:
- `### Photo to doodle converter` — the exact "converter" noun (from
  `photo-to-doodle-converter`, `convert-photo-to-doodle`).
- The "online free / no install / phone browser" reassurance (from
  `convert-photo-to-doodle-online-free`, `apps-to-doodle-on-photos`) — one paragraph in
  the existing How-to step, noting it runs in a mobile browser with no app to install.
- Keep the existing "what it is not" block — that honest section is *why* this body is
  the strongest and should remain the hub.

**`/doodle-generator/` (Hub B)** must gain:
- `### Is the doodle generator free?` — starter credits, 1 credit/run, refund-on-fail,
  no paywall, no card (absorbing `doodle-generator-free`,
  `ai-doodle-generator-free`, `convert-photo-to-doodle-online-free`).
- A one-line note that it also handles "doodle art / doodle image / doodle drawing"
  phrasing so it matches the redirected `*-art-*` / `*-image-*` / `*-drawing-*` queries
  — a single sentence, not a keyword-stuffed list.
- An internal link block pointing to the 5 distinct keepers (photo-to-doodle,
  image-to-doodle, picture-to-doodle, doodle-maker, text-to-doodle) so the hub is the
  browseable index Google's guidance asks for — a "clearly defined, browseable
  hierarchy," which is the *opposite* of a doorway.

**`/image-to-doodle/` and `/picture-to-doodle/`** each gain one `### … converter` H2
absorbing their `-converter` sibling, and nothing else — they are already distinct.

**`/text-to-doodle/` (Hub C)** absorbs nothing from the photo cluster; it only gains an
internal link to/from `doodle-character-generator` so the two `surprise` pages form
their own small browseable pair.

---

## 4. Redirect risks — the pages that turn a cleanup into a traffic loss

These are the redirects to execute **last and only after checking Google Search
Console**, because they carry real volume and/or may hold live rankings or inbound
links. A blind 301 here could shed traffic the thin page is actually earning.

1. **`make-a-doodle` (US 170 / IN 210) → `/doodle-generator/`** — *highest-risk
   redirect in the plan.* This is not a US-20 doorway; it has meaningful volume on both
   sides. It is in the doorway list because it binds to `normal` with a clone body, but
   the *keyword* is not a pure synonym and may hold a ranking. **Do not 301 blindly:**
   pull GSC impressions/clicks/position for `/make-a-doodle/` first. If it ranks on
   page 1 for "make a doodle," keep it and rewrite the body to be genuinely unique
   instead of redirecting. If it ranks nowhere, 301 into `/doodle-generator/`.
2. **`doodle-maker-online` (IN 110) → `/doodle-maker/`** — lower risk (the target is the
   near-exact phrase and a KEEP), but IN 110 is real. Redirect to `/doodle-maker/`, not
   to `/doodle-generator/`, so the "maker" ranking stays inside the maker hub. Verify
   `/doodle-maker/` itself is indexed before pointing traffic at it.
3. **`image-to-doodle-converter` (IN 110)** and **`picture-to-doodle`'s IN 140** —
   `picture-to-doodle` is a KEEP precisely because IN 140 is the largest number in the
   doodle-converter set; do not let a future tidy-up sweep it into `photo-to-doodle`.
   The converter sibling (IN 110) merges *into picture/image*, never into
   `photo-to-doodle`, to keep the India ranking within its own intent.
4. **Inbound-link check (all tiers).** Before any 301, run a backlink check (Ahrefs /
   Semrush / GSC Links report) on every REDIRECT-tier URL. Any page with an external
   inbound link must 301 (never 404) and the link equity must land on a *topically
   matching* hub — which the destinations above already ensure. The internal links are
   the bigger exposure: every keeper body cross-links these slugs (e.g.
   `doodle-art-generator` links to `doodle-image-generator`), so **update internal
   links to point at the hub in the same change as the redirect**, or the site will
   serve its own users into 301 chains.

**Rule for execution order:** absorb content into hubs → update internal links →
301 the REDIRECT tier (lowest volume first) → 301 the MERGE tier → *stop and read GSC
for `make-a-doodle` before touching it.* Never remove a source file without the 301
in place first (a 404 loses the equity a 301 preserves).

---

## 5. The anime cluster — how to build it *after* this is clean

`docs/anime-positioning.md` §3 is binding: **no anime landing pages ship until the
doorway cluster above is consolidated,** because minting a page per anime style noun
would be the identical doorway mistake at larger scale. Once §2–§4 are executed, build
anime like this:

### 5a. Shape — one hub, a small number of intent-distinct pages

| Page | Intent | Ships as | Notes |
|---|---|---|---|
| `/photo-to-anime/` | head demand: "turn my photo into anime" | **hub tool page** | The one strong converter. Anime *families* (pirate-voyage, ninja-village, monster-tamer, and the reconciled image families) are selectable **chips inside this page**, never separate URLs. |
| `/anime-pfp-maker/` (or `/anime-profile-picture/`) | distinct job: avatar/pfp, square, for social | separate page | Earns its own URL only because "pfp maker" is a materially different task than "photo to anime" — same test §1 applies. Verify volume in GSC/Semrush before building; if flat, fold into the hub. |
| `/anime-art-style/` (informational) | "what do anime art styles look like" | **style-gallery layout** | Output-led gallery, composer below — the layout `docs/tool-pages-plan.md` identified for `/cute-doodle/`-shape informational queries. Not a converter template. |

**Ceiling: 3 anime URLs at launch**, not one-per-genre. Genre families are looks
inside the hub (the chip row), consistent with `anime-positioning.md` §1's
"anime is a style family, not a sub-brand."

### 5b. The unique-body bar each anime page must clear

Every anime page that ships must independently satisfy — verified before publish, the
same bar the doodle cluster failed:

1. **Its own body**, not a shared shell with "doodle" → "anime" swapped. If two anime
   pages share more than the layout, one of them should not exist.
2. **Its own FAQ** — ≥3 real, page-specific Q&As (the `category:"tool"` build guard in
   `src/content.config.ts` already enforces ≥3, per `docs/tool-pages-plan.md`).
3. **Its own before/after examples** — real generations from the bound skill, not
   stand-ins. The three new anime skills must actually render first (Lane 1 of this
   wave) or the pages have no honest proof.
4. **A genuinely distinct intent per URL** — pass the §1 test: a new URL only when the
   *job* differs, never when the *adjective* differs.
5. **Franchise-free** — no series/studio/character noun in copy, title, slug, or
   prompt (the standing wave rule and `anime-positioning.md` §5 Option A default).
6. **Browseable hierarchy** — the hub links to the intent-distinct pages and back, so
   the anime set reads as a defined hierarchy, the explicit opposite of the doorway
   pattern Google names.

If a proposed anime page cannot clear all six, it becomes a chip/section inside
`/photo-to-anime/`, not a URL.

---

## 6. Volume caveat — what I could and could not verify

- **Verified on disk (this lane):** every slug exists, its skill binding, its
  category, and its body word count. The skill-binding claim ("all bound to `normal`")
  is confirmed true for the whole doorway cluster except the two `surprise` pages
  (`text-to-doodle`, `doodle-character-generator`), which I re-classified into intent C
  accordingly.
- **Verified externally:** Google's current
  [doorway-abuse spam policy](https://developers.google.com/search/docs/essentials/spam-policies)
  wording, which is *stricter and more specific* than the 2015 post the old docs cited
  — that is the material update this plan adds.
- **Could NOT independently re-verify:** live per-URL search volumes and current
  rankings. This lane has no Semrush/GSC/Ahrefs access, so the numbers are the in-repo
  workbook figures as transcribed, and I did not invent any. **Every REDIRECT with a
  volume above ~50 (notably `make-a-doodle` US 170 / IN 210 and the IN-110 pages) MUST
  be checked against live GSC before its 301 is executed** — that check, not this
  document, is the gate on the risky redirects in §4.

---

## Sources

- Google Search Central — [Spam Policies for Google Web Search: Doorway abuse](https://developers.google.com/search/docs/essentials/spam-policies)
  (current; supersedes the 2015 "doorway pages" post cited in the older in-repo docs).
- Google Search Central — [Content policies for Google Search](https://support.google.com/websearch/answer/10622781)
  (manual actions against spam).
- In-repo — `docs/tool-pages-plan.md` (the 16 named doorway-risk pages; Batch 3
  cartoon boundary), `docs/seo-keyword-pages-spec.md` ("unique body per URL; fold weak
  phrases into the strong page"), `docs/anime-positioning.md` §3 (anime cluster shape;
  no anime pages until this is resolved).
- On-disk inventory of `src/content/articles/*/index.md` (skill binding + body length),
  read 2026-09-02 for this plan.
