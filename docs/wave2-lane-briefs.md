# Wave 2 lane briefs — anime animation skills + consumer language

Read this whole file, then your own lane section. Repo: `/Users/yash/Projects/doodle-ai`,
branch `dev`, a full day of **uncommitted** work in the tree.

Background spec: `docs/doodle-to-video-plan.md` (read §2 and §4).

---

## SHARED RULES — apply to every lane

### File ownership is absolute
Four agents run concurrently. Write ONLY the paths listed in your own lane. Touching
another lane's path is a hard failure, not a merge conflict to sort out later.

| Lane | Owns |
|------|------|
| A | `src/lib/video/skills.ts`, `src/lib/video/prompts.ts`, THREE new `src/mastra/skills/<id>/SKILL.md` |
| B | `scripts/generate-video-skill-covers.ts`, `scripts/check-media-models.mjs`, `package.json`, the `thumbnailUrl` line in `src/mastra/skills/doodle-spark/SKILL.md` and `doodle-starcast/SKILL.md` |
| C | `src/components/app/SkillCard.astro`, `src/pages/skills/index.astro`, `src/pages/index.astro`, `src/styles/app.css` (`.skill-card*` rules ONLY) |
| D | `src/pages/showcase/index.astro`, `src/components/app/ClipTile.astro`, `src/styles/showcase.css`, `src/styles/video-card.css`, `src/scripts/app/chat/video-job.ts` |

**Nobody touches `src/lib/video/constants.ts`.** The model pin (`minimax/h3-max`), the
480p ceiling and `VIDEO_ESTIMATED_SECONDS` are frozen. That constant was just moved
75 → 20 off four measured live renders (4.5s, 4.6s, 5.3s, 7.6s). Consume it, never
redefine it.

### The IP guardrail — read twice
The owner named Pikachu and Naruto as content that renders well. Those characters are
owned (Pokémon Company, Shueisha) and **cannot ship on a commercial marketplace**:
trademark plus right-of-publicity, and upstream models refuse many named-character
prompts, so such a skill is unlawful *and* flaky. Build **style, never cast**.

No character, series, studio, film, franchise or artist name in ANY prompt, example,
tagline, description or copy. That bans "saiyan", "ghibli-esque", "shonen jump",
"sailor-moon-like" too. Use craft words instead: shonen action, magical-girl,
slice-of-life, cel-shaded, sakuga burst, impact frame, speed lines. Grep your own
output for proper nouns before finishing and report the result.

### Consumer vocabulary — the audience is non-technical B2C
Users are consumers, not developers. In every user-visible string:

- **Say:** animation, moving doodle, watch it come to life, brings your doodle to life
- **Never say:** video, render, generate, clip, resolution, 480p, model, queued,
  webhook, generation, endpoint, mode

Also **cut text**. The owner wants less prose, more icons and motion. A tile does not
need a tagline AND a description AND a badge — keep the one that earns its place.
Prefer an icon plus 2-4 words over a sentence.

### Design constraints
- Consume CSS custom properties, **never redefine one**. A global token edit was made
  and reverted today for silently repainting the entire app.
- No blue, violet or indigo. Flat surfaces, thin rules, no shadowed cards.
- Mobile first: 375 / 390 / 430, tablet, desktop. 44-48px touch targets.
- Any video element: `muted loop playsinline preload="metadata"`, poster set, **no
  `src` until play intent** (use `data-src`), never autoplay-all-on-load, hover-play
  only under `(hover: hover) and (pointer: fine)`, honour `prefers-reduced-motion`,
  and never any audio on a tile.

### Verification and hygiene
- `pnpm exec tsc --noEmit`, then **ONE** `pnpm build` at the end. Host memory is tight
  (~2.8 GB) — do not loop builds.
- Two pre-existing `board-share.ts` TS2393 errors are not yours.
- There is no Playwright here. Assert against built or served HTML and **say plainly
  that you have not seen it rendered**. The dev server is live on
  `http://localhost:4322` — curling it is stronger evidence than `dist/`.
- Never commit, push, reset, clean or checkout. Do not spawn sub-agents.
- Write your files to disk **before** ending your turn.

---

## LANE A — three personalised anime animation skills (research first)

Goal: make anime the strongest thing this product does. Add **three** new video skills,
each personalised (driven by the user's own photo or their existing doodle).

**Research before writing.** Use `web_search` / `web_fetch` to build real style
vocabulary — the existing prompts were written from memory and it shows. Look up how
animators and fans actually describe: sakuga vs limited animation, cel shading and
hard-edged shadow shapes, impact and smear frames, speed lines, key-visual
composition, 2-3 frame holds, the "near-still frame plus a moving light layer" trick,
colour-script terms (golden-hour rim light, twilight gradient), and classic beat
shapes (the transformation, the power-up, the quiet slice-of-life pause, the
opening-credits montage, the rain-soaked confession). **Cite the URLs you used.**

Then:
- Study all four existing video skills end to end first: `src/mastra/skills/doodle-motion/`,
  `doodle-reel/`, `doodle-spark/`, `doodle-starcast/`, plus `src/lib/video/skills.ts`
  and `prompts.ts`. Match the SKILL.md frontmatter shape exactly (`metadata.id`,
  `kind: video`, `displayName`, `tagline`, `desc`, `longDesc`, `category`, `tags`,
  `runnable`, `requiresPhoto`, `aspectRatio`, `sampleIndex`, `order`).
- Register each id in `VIDEO_SKILL_IDS` and `VIDEO_SKILLS` with its mode
  (`image` = the exact doodle becomes frame one and animates; `reference` = a NEW shot
  composed from the character's likeness), `requiresPhoto`, `defaultSeconds`,
  `aspectRatio`.
- **Check id collision** against `GENERATION_MODES` in `src/lib/doodle-constants.ts`
  before naming anything: a shared id prices a five-second animation as one image and
  routes it to the image endpoint. Confirm uniqueness across all 27 existing skills.
- Cover both modes and pick a genuinely different beat per skill — three variations of
  one idea is a failure. Aim for range: one intimate everyday moment, one high-energy
  action beat, one title-sequence feel.
- Keep motion small and hand-drawn. The source is a marker doodle, so a sweeping
  cinematic camera fights the art; anime's own near-still-plus-moving-light trick is
  exactly right.
- Do **not** set a `thumbnailUrl` and do not reuse another skill's art — lane B makes covers.

The build's per-kind skill drift validator is your real gate: it throws loudly if a
video skill is priced or routed as an image. Report its output.

**Report:** the 3 ids + modes + why each mode, your research URLs, the full prompt
text, and your proper-noun grep result.

---

## LANE B — covers, plus a guard that makes the two-model decision permanent

**Task 1 — real covers for `doodle-spark` and `doodle-starcast`.** They currently fall
back to a synthetic SVG and read as two holes in a wall of 25 real thumbnails — the
same "looks broken" problem the last wave existed to fix.

- Follow the existing two-stage pipeline in `scripts/generate-video-skill-covers.ts`,
  which already produced the `doodle-motion` and `doodle-reel` covers: synthesize a
  subject photo, run the app's own `buildDoodlePrompt` through `/v1/images/edit`, then
  render the frame the skill would actually produce.
- Image model is `openai/gpt-image-2` and nothing else (~53 credits each, so ~106 for
  two; do not exceed 4 images without saying so). Read `PICX_API_KEY` from `.dev.vars`
  and never print it.
- `spark` is a power-up beat (aura, speed lines, a held impact frame) at 1:1;
  `starcast` is a magical-girl transformation shot at 3:2 landscape.
- **Verify each URL returns HTTP 200 with real image bytes BEFORE writing
  `thumbnailUrl`.** A 404 cover renders identically to the fallback and would look
  like the work silently failed.
- Synthetic subject face, never a real person. No named character (see guardrail).

**Task 2 — `scripts/check-media-models.mjs`.** The two-model lock is currently a
convention; nothing stops a future agent adding a third.

- Fail with a clear message if any file under `src/` names a media model id other than
  `openai/gpt-image-2` or `minimax/h3-max`. Derive the allowed pair from
  `src/lib/video/constants.ts` and `src/lib/media/submit-image.ts` rather than keeping
  a second copy of the truth.
- Do **not** flag `google/gemini-3.7-flash` in `src/mastra/agents/doodle-agent.ts` —
  that is the CONVERSATIONAL model, not a media model. The check must understand this
  distinction or the first person it annoys will delete it. Also ignore comments and
  the build-time asset scripts under `scripts/`, which legitimately use cheaper models
  for blog art.
- **Prove it fails, not just passes:** run it clean on the tree, then introduce a fake
  third model id in a scratch copy to show it actually catches one. Paste both
  outputs. A guard that has only ever passed is not a guard.
- Wire it into the existing `check` script in `package.json`. No new dependencies.

**Report:** credits spent, verified cover URLs with status codes, both guard outputs.

---

## LANE C — the skills wall: consumer words, and tiles that move

**Goal 1 — language.** Today the UI says "video". Replace that vocabulary in your
files per the shared list, and cut text hard.

**Goal 2 — video skills must SHOW motion.** Three real animations exist in
`src/data/showcase-clips.json` (read it defensively — `fs` + try/catch or
`import.meta.glob`; the page must build if it is missing). Each entry has `cdnUrl`,
`sourceImageUrl`, `skillId`, `mode`. Where a video skill's id matches a clip, the tile
plays it. Where there is no clip yet, keep the still cover plus a clear "moves"
affordance. Obey the video rules in SHARED — a wall of tiles each pulling 2 MB on
mobile data is the failure to avoid.

**Goal 3 — make animation findable.** Video skills are 4 of 27 and buried among
stills. Surface them first, or give them an unmistakable visual marker. Keep the
uncropped full-aspect thumbnails and the mosaic — both were explicit owner requests
and must not regress. Tile links stay real `<a href>` so cmd/middle-click still work.

**`app.css` limit:** you may edit ONLY rules whose selector starts `.skill-card` /
`.skill-tile` / `.skill-grid`, and not one custom-property definition.

**Report:** every user-visible string changed (old → new), how many words you removed,
and what a video tile does in each of four states: clip available, no clip yet,
reduced motion, play refused.

---

## LANE D — showcase page and chat wait state

**Goal 1 — the words.** The showcase currently labels tiles "Image-to-video — this
exact doodle, animated" and "Reference-to-video — a new shot of the character". Those
are API mode names leaking onto a consumer page. Say the same true thing in human
words — "Your doodle, brought to life" vs "A brand-new scene starring your doodle".
Keep the distinction, it is the product story; stop naming it after the endpoint.

**Goal 2 — the chat wait state.** `src/scripts/app/chat/video-job.ts` drives what a
user sees while an animation is being made. It now receives a 20s expectation instead
of 75s, so re-read its copy end to end: anything implying a long wait, any
"rendering"/"queued"/"video" wording, any elapsed-vs-estimate phrasing that reads as a
stall. Animations really land in 4-8 seconds, so this should feel like a short beat,
not a progress vigil. Stay honest: no fake progress bar, no invented percentage, and
when a failure refunds credits say so plainly. Keep the elapsed clock if it is truthful.

**Goal 3 — close the loop from watching to making.** A visitor who just watched a
doodle move has no way to make one. Add a per-tile call to action that starts that
skill. The existing pattern pins the skill into the composer and toasts
"<Skill name> ready", wired from `src/scripts/app/home.ts` — **which you do not own**,
so use the existing href/route pattern rather than inventing JS plumbing in someone
else's file. If a real CTA cannot be wired without touching a file you do not own, say
so in your report instead of half-wiring it.

**Report:** every string changed (old → new), what the wait state says at 0s / 5s /
20s / failure, and whether the CTA is fully wired or blocked.
