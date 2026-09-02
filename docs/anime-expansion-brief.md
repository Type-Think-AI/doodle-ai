# Anime as a style family inside Doodle AI — wave 3 brief

Owner decision: **one brand, two audiences.** Doodle AI stays the product and the
domain. Anime is not a second platform, not a second marketing budget — it is a
first-class **art family** inside this one app, reachable from a chip next to the
prompt.

That is the right call and the architecture already leans that way. See §2.

---

## 1. The IP line, settled with a citation

The owner has asked three times for One Piece / Naruto / Pokémon style. Here is the
distinction that actually matters, and it is not the same answer in both places.

**In a prompt sent to the model: never name a franchise, series, studio, artist or
character.** Two independent reasons. Upstream models refuse many named-character
prompts, so the skill would fail intermittently and read as our bug. And asking for
a specific character's likeness produces a derivative of a protected character —
that is the copyright exposure, not the style.

**In a label, a page title or marketing copy: this is a business risk the owner
owns, and there is precedent.** The reference the owner sent, `anifusion.ai/style`,
names series openly and carries a nominative-use disclaimer: *"references to styles,
series, or artists for descriptive purposes only… all trademarks, style names, and
character names mentioned are property of their respective owners… we do not claim
affiliation, sponsorship, or endorsement."* A competitor in this exact niche has
decided descriptive style references plus a disclaimer is an acceptable risk.

So there are two shippable options and they are not equivalent:

- **Genre naming (default, no legal review needed).** "Pirate Voyage", "Ninja
  Village", "Monster Tamer", "Grand Tournament", "Spirit Bathhouse". Each names the
  *genre and look* that made the famous show recognisable, with no mark attached.
  Recognition without the trademark. This is what every lane builds now.
- **Descriptive series naming (needs the owner's yes and a disclaimer).** Marketing
  and SEO copy naming series as style references, anifusion-style, with the
  disclaimer footer. Higher search volume, real takedown risk from Shueisha and
  Toei, who both enforce. **Not built by any lane in this wave** — Lane E documents
  it as a decision with the risk stated, for the owner to take or refuse.

Either way, the prompt strings stay franchise-free. Grep your own output.

---

## 2. Why this is cheap: the seam already exists

`src/lib/doodle-constants.ts` already has `THEMES` — `{ id, label, bg, accent,
styleHint }` — and `buildDoodlePrompt(styleHint)` injects that hint into the image
prompt. `src/lib/video/prompts.ts` builders already take `{ themeHint, styleHint,
description }`. So **every image skill and all 7 video skills already consume a
style hint.** Today those four themes (pastel / neon / sunset / mono) are buried
behind a settings icon in the composer.

The owner's "small chip between the prompt and the skill" is therefore not a new
system. It is:

1. promoting that hidden hint into a visible **art family** chip row, and
2. adding anime families to the list.

Do NOT overload the existing `category` field (`avatars` / `collages` / `freeform`
/ `packs`) — that axis answers "what shape of output is this" and a skill needs
both. Art family is a second, orthogonal axis: **what it looks like.** A Doodle
Avatar and an Anime Avatar are the same category, different family.

---

## 3. Lane ownership — strictly disjoint

| Lane | Agent | Owns |
|------|-------|------|
| A | Alex | `docs/anime-style-research.md` (new). **No code.** |
| B | Alex | `src/lib/art-families.ts` (new), `src/lib/video/prompts.ts`, `src/mastra/tools/generate-doodle.ts` |
| C | Sara | `src/components/app/composer/ComposerFamilyChips.astro` (new), `src/components/app/composer/composer-styles.css`, `src/pages/skills/index.astro`, `src/scripts/app/home.ts` |
| D | Sara | `src/lib/doodle-constants.ts`, `src/lib/credits/costs.ts`, new `src/mastra/skills/<id>/SKILL.md` packages |
| E | Teo | `docs/anime-positioning.md` (new). **No code.** |

Nobody touches `src/lib/video/constants.ts` (model pin `minimax/h3-max`, 480p
ceiling, `VIDEO_ESTIMATED_SECONDS=20` — all frozen), `src/lib/video/skills.ts`,
`src/data/showcase-clips.json`, or `src/styles/app.css` custom properties.

## Shared rules

- **Consumer language.** Audience is non-technical Gen-Z B2C. Say animation, moving
  doodle, comes to life. Never video, render, clip, resolution, 480p, model, queued.
  Cut text; prefer an icon plus 2-4 words.
- **No franchise nouns in any prompt string.** Grep before reporting.
- Consume CSS custom properties, never redefine one. No blue/violet/indigo. Flat
  surfaces, thin rules. Mobile first 375/390/430. 44-48px targets.
- `pnpm exec tsc --noEmit` then **ONE** `pnpm build`. Host memory is tight. Two
  pre-existing `board-share.ts` TS2393 errors are not yours.
- No Playwright here — assert against built or served output and say plainly you
  have not seen it. Dev server is live on `http://localhost:4322`.
- Never commit, push, reset, clean or checkout. Do not spawn sub-agents. Write files
  before ending your turn.

---

## LANE A — style research, with citations

Produce `docs/anime-style-research.md`: a taxonomy a prompt author can use, built
from real sources, not memory. Use `web_search` / `web_fetch` and cite every claim
with a URL.

Cover, for each family: the **linework** (weight, tapering, ink texture), the
**colour** (flat cel fills vs gradients, palette temperature, era-specific looks
like 90s film grain vs modern digital compositing), the **face and body grammar**
(eye size and placement, nose treatment, proportion ratios, chibi head-to-body),
the **motion grammar** (limited animation on 2s/3s, sakuga bursts, smear and impact
frames, speed lines), and the **shot grammar** (key visual, transformation beat,
tournament stare-down, quiet slice-of-life pause).

Give at least these families a craft description with no franchise noun in it:
shonen action, seinen realism, shojo romance, chibi, mecha, magical-girl,
slice-of-life, sports, dark fantasy, 90s cel, modern digital, watercolour/ink.

Then map the genres the owner named — pirate voyage, ninja village, monster tamer —
to their craft signature, so a skill can evoke the look people recognise without
naming the show. That mapping is the deliverable the other lanes depend on most.

Start with the owner's references: [Wikipedia: Anime](https://en.wikipedia.org/wiki/Anime),
[CBR best anime art styles](https://www.cbr.com/best-anime-art-styles/),
[CBR iconic shonen art styles](https://www.cbr.com/best-shonen-anime-iconic-artstyles/),
[anifusion styles](https://anifusion.ai/style/). Note that both CBR pages are
JS-heavy and returned mostly boilerplate to a plain fetch — find the substance
elsewhere rather than reporting an empty read.

## LANE B — the art-family data model

New `src/lib/art-families.ts`: an `ART_FAMILIES` list shaped like the existing
`THEMES` (`id`, `label`, one-line consumer `blurb`, `styleHint`, plus an
`appliesTo: ('image'|'video')[]`). Families: the existing doodle look, plus the
anime families Lane A describes. Keep `THEMES` working — palette themes and art
families are different dials and both feed a style hint.

Wire the family's `styleHint` through `src/mastra/tools/generate-doodle.ts` (image)
and `src/lib/video/prompts.ts` (all 7 video builders), so one chip changes both
still and animation output. Default must remain the doodle look — an existing user
who touches nothing sees no change.

Read Lane A's `docs/anime-style-research.md` if it has landed; if it has not, write
the hints from craft vocabulary and say in your report which families still need a
research pass.

## LANE C — the chip row

A single-row, horizontally scrollable family chip set in the composer, between the
input and the toolbar, reading from `ART_FAMILIES` (Lane B's file — if it is not
there yet, define a local fallback list and say so). Selected state persists in
localStorage like the theme does. Each chip is a real control: 44px minimum,
keyboard reachable, `aria-pressed`.

Also add family filter chips to `/skills`, alongside the existing search, so
someone who came for anime can see only anime skills. Do not regress the mosaic,
the uncropped full-aspect thumbnails, or the existing hover-play animation tiles.

## LANE D — anime image skills

Three new **image** skills in the anime families (the owner wants anime in both
categories, and 23 of 30 skills are stills). Register each in `GENERATION_MODES`
and the per-image cost table, add its prompt branch, and write its `SKILL.md` to
match the existing frontmatter shape exactly. The build's per-kind drift validator
is your gate — it fails loudly if a mode, cost entry and prompt branch disagree.

Genre naming per §1: no franchise noun in an id, a label, a tagline or a prompt.

## LANE E — positioning, without a second brand

Produce `docs/anime-positioning.md` answering the owner's actual worry: *we market
as doodle, now we also want anime, does that break the brand?*

Cover: brand architecture (one domain, anime as a style family and an SEO cluster,
not a sub-brand); why a second domain is the expensive answer (two content
calendars, two link profiles, no compounding); the SEO cluster shape for anime
style pages given the existing 23 landing pages and the doorway-page risk already
documented in this repo; how the home page speaks to both audiences without
becoming generic; and the §1 decision — genre naming versus descriptive series
naming with a disclaimer — laid out as a choice with the real risk on each side,
including that Shueisha and Toei enforce. Recommend, do not decide.
