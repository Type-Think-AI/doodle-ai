# Wave 4 lane briefs — prove the anime work, then tidy behind it

Repo `/Users/yash/Projects/doodle-ai`, branch `dev`, three waves of **uncommitted**
work in the tree. Background: `docs/anime-expansion-brief.md`,
`docs/anime-style-research.md` (cited craft taxonomy),
`docs/anime-positioning.md`, `docs/doodle-to-video-plan.md`.

Wave 3 shipped 10 art families, 3 anime image skills and the chip that drives them.
**Nothing anime has ever been rendered.** That is what this wave fixes first.

---

## SHARED RULES

### File ownership is absolute
Five agents run concurrently. Write ONLY your lane's paths.

| Lane | Owns |
|------|------|
| 1 | `scripts/generate-anime-skill-covers.ts` (new); `thumbnailUrl` line only in `src/mastra/skills/{pirate-voyage,ninja-village,monster-tamer}/SKILL.md` |
| 2 | `scripts/generate-showcase-clips.ts`, `src/data/showcase-clips.json` |
| 3 | `src/lib/art-families.ts` |
| 4 | `src/components/app/SkillCard.astro`, `src/scripts/app/skills-search.ts`, `src/pages/skills/index.astro` |
| 5 | `docs/doorway-consolidation-plan.md` (new). **No code.** |

Frozen for everyone: `src/lib/video/constants.ts` (model pin `minimax/h3-max`,
480p, `VIDEO_ESTIMATED_SECONDS=20`), `src/lib/video/skills.ts`,
`src/lib/doodle-constants.ts`, `src/lib/credits/costs.ts`, `src/lib/video/prompts.ts`,
`src/mastra/tools/*`, `src/pages/api/*`, `src/scripts/app/chat/*`,
`src/styles/app.css` custom properties.

### Standing rules
- **Media models: `openai/gpt-image-2` for stills, `minimax/h3-max` for clips.
  Nothing else, ever.** `scripts/check-media-models.mjs` enforces it.
- **No franchise noun** — no series, studio, artist or character name in any
  prompt, label, id or copy. Not "shinobi" (Sega mark). Grep your own output.
- **Consumer language**: animation, moving doodle, comes to life. Never video,
  render, clip, resolution, 480p, model, queued.
- Read `PICX_API_KEY` from `.dev.vars`; never print it. Credits are real money:
  a still is ~53, a 5s animation is 150.
- Consume CSS custom properties, never redefine one. No blue/violet/indigo.
- `pnpm exec tsc --noEmit`, then **ONE** `pnpm build`. Host memory is tight. The
  two `board-share.ts` TS2393 errors are pre-existing.
- No Playwright here: assert against built or served output and say plainly you
  have not seen it. Dev server is live on `http://localhost:4322`.
- Never commit, push, reset, clean or checkout. Do not spawn sub-agents. Write
  files to disk before ending your turn.

---

## LANE 1 — render the three anime skills, then give them covers

The three new anime image skills (`pirate`, `ninja`, `tamer`, in
`src/mastra/skills/{pirate-voyage,ninja-village,monster-tamer}/`) have **never been
through the model** and all three show the synthetic SVG placeholder beside 30 real
thumbnails. Both problems die with one render each.

Write `scripts/generate-anime-skill-covers.ts` following the existing two-stage
pattern in `scripts/generate-video-skill-covers.ts`: a synthetic subject photo (never
a real person), then the skill's **own** prompt builder from `src/lib/prompts/` so
this tests what ships rather than a paraphrase. `openai/gpt-image-2`, ~53 credits
each, ~159 total; do not exceed 5 images without saying so.

Verify each URL returns HTTP 200 with real image bytes **before** writing
`thumbnailUrl` into the SKILL.md — a 404 cover renders identically to the
placeholder and would look like the work silently failed. Add `--dry-run` that
spends nothing, and make a re-run idempotent (skip a skill whose thumbnail already
verifies).

Report, honestly, whether each image actually reads as its genre — rubbery limbs and
tropical palette; earth tones with one glowing accent and the hands-together beat;
a rounded creature with a coin-size-readable silhouette. You cannot see them, so
report what the API returned and say plainly that the look is unverified.

## LANE 2 — render one anime ANIMATION per genre family

This is the payoff: the owner's excitement is that H3 Max anime is "very very good",
and no anime animation exists. Extend `scripts/generate-showcase-clips.ts` to render
three more 5s 480p animations, one per genre family, and append them to
`src/data/showcase-clips.json` so `/showcase` and the matching skill tiles pick them
up automatically.

Compose each prompt from the family's `styleHint` in `src/lib/art-families.ts`
(`pirate-voyage`, `ninja-village`, `monster-tamer`) plus a video builder from
`src/lib/video/prompts.ts` — read both, import rather than retype. Use `reference`
mode with an existing paid-for doodle PNG as the reference (reuse a `thumbnailUrl`
from a SKILL.md; verify 200 before spending) so there is no image spend.

Keep the script's existing guards: `--dry-run` spends nothing, idempotent re-run,
poll `GET /v1/generations/{id}` (out-of-band asset script — the **product** stays
webhook-only, do not change that), verify every returned URL is 200 `video/mp4` with
real bytes before writing it. ~450 credits.

Report each animation's URL, byte count and measured render time from PicX's own
`created_at`/`completed_at`.

## LANE 3 — reconcile the styleHints against the cited research

Six of the seven original families in `src/lib/art-families.ts` (`shonen-action`,
`magical-girl`, `chibi`, `slice-of-life`, `retro-cel`, `ink-wash`) were written from
memory before `docs/anime-style-research.md` landed. That doc now carries a cited
craft description per family across five dials, and it **contradicts** what was
guessed in at least one known place: Japanese speed lines streak the *background*
and hold the subject sharp, the opposite of the western convention.

Rewrite those six `styleHint` strings against the research — lift its prompt-ready
cues where they fit. Keep every hint one paragraph, keep the `doodle` default an
empty string, keep the three genre families as they are (already sourced), change no
ids, labels or blurbs, and add nothing to the type. `tsc` and one build.

Report a per-family before/after and, specifically, every place the research
contradicted the guess — that list is the value of this lane.

## LANE 4 — touch playback, and the orphan the last wave left

Two things.

**Animation tiles never move on touch.** Playback is hover-only under
`(hover: hover) and (pointer: fine)`, which is correct for bandwidth and wrong for a
phone-first B2C audience — most visitors will never see a tile move. Add a
**tap-to-play affordance on the marker itself, not the whole tile**, so the tap that
navigates and the tap that plays stay distinct: tapping the ▶ marker loads and plays
that one animation inline, tapping anywhere else still follows the link. One playing
at a time, still muted and looping, still no `src` until play intent, still
`prefers-reduced-motion` respected, never any audio.

**`src/scripts/app/skills-search.ts` is now unreferenced** — wave 3 took search over
inside `src/pages/skills/index.astro` rather than leave two writers on `item.hidden`.
Fold the page's inline search+filter logic back into that module and import it, or
delete the module if folding is worse. Either is fine; two copies of search is not.

Do not regress the mosaic, the uncropped full-aspect thumbnails, the family filter
chips, or hover-play on desktop.

## LANE 5 — the doorway-page consolidation plan

`docs/tool-pages-plan.md` already names **16 doorway-risk pages** — low volume, all
bound to the same `normal` skill, all describing one generator in different words —
and `docs/seo-keyword-pages-spec.md` already sets "unique body per URL, no template
with one noun swapped". `docs/anime-positioning.md` concluded no anime landing pages
should ship until this is resolved, or we compound it.

Produce `docs/doorway-consolidation-plan.md`: **a reviewed plan, no code, no
deletions.** For every one of the ~23 landing pages in that cluster give the verdict
(keep / merge / redirect), the destination URL for each redirect, the search volume
and intent that justifies it, and what content the surviving hub must absorb so the
merge does not lose the ranking the thin page holds today. Name the exact files, and
call out any page that is an inbound-link or ranking risk to redirect.

Then specify how the anime cluster gets built *after* it: how many pages, on what
intents, and the unique-body rule each must satisfy. Cite Google's doorway guidance
and check current rankings/volumes where you can rather than trusting the numbers in
the old docs.
