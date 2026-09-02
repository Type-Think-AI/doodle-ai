# Doodle-to-Video: model lock, skills, and a real showcase

Owner decision, 2026-09-01: **two media models only.**

| Job | Model | Where it is declared |
|-----|-------|----------------------|
| Every still doodle | `openai/gpt-image-2` | `src/lib/media/submit-image.ts`, `src/lib/batch/prompt.ts` |
| Every clip | `minimax/h3-max` | `src/lib/video/constants.ts` (`VIDEO_MODEL`) |

Chosen on measured cost, speed and quality — not on a spec sheet. Nothing else is
to be added, and no per-user or per-skill model choice is to be introduced.

---

## 1. Verified starting state

Checked on disk, not recalled:

- **The runtime already obeys the decision.** A grep of `src/` for every model id
  in PicX's registry returns exactly two: `openai/gpt-image-2` and
  `minimax/h3-max`. There is no model picker, and no skill declares a model.
- **Other model ids exist only in build-time asset scripts** —
  `scripts/generate-blog-thumbnails.mjs`, `scripts/generate-tool-examples.mjs`,
  `scripts/generate-partner-doodles.mjs` reference `seedream/v5/lite` and
  `nano-banana-2-lite`. These render marketing art at build time and never run in
  the product. They are out of scope for the lock, but they are why a naive grep
  looks like the app is multi-model.
- **One Google model is in the runtime and it is not a media model.**
  `src/mastra/agents/doodle-agent.ts` runs on `google/gemini-3.7-flash` through
  OpenRouter. That is the conversational brain that decides which tool to call; it
  never renders a pixel. The media lock does not touch it.
- **Delivery is webhook-only, proven live today.** One image (53 credits) and one
  5s 480p clip (150 credits) were generated end to end through
  `PICX_CALLBACK_ORIGIN` + ngrok, delivered to `/api/webhooks/picx`, and completed
  their D1 rows. Render time for the clip was **5.3 seconds** wall clock on PicX's
  own timestamps.
- **25 skills exist; only 2 are video** (`doodle-motion` = image-to-video,
  `doodle-reel` = reference-to-video), registered in
  `src/lib/video/skills.ts` as `VIDEO_SKILL_IDS = ["motion", "reel"]`.
- **Both video skills advertise themselves with a still image.** Their covers are
  PNGs with a "Clip" text badge. No clip has ever been shown to a visitor.
- **There is no showcase surface.** `src/pages/` has `/skills`, `/tools`,
  `/learn`, `/for-studios`, `/characters`, `/boards`, `/roadmap` — nothing that
  plays video.

### The actual positioning problem

23 of 25 skills output stills, every tile on the site is a still, and the two
video skills are advertised with stills. A visitor has no way to learn that this
app makes things move. That is the whole of "people think a doodle is just an
image" — it is not a copy problem, it is a **missing artefact** problem. The fix
is real clips on real surfaces, served from the CDN URLs PicX already returns.

### Resolution ceiling (unchanged, still the one hard limit)

H3 Max renders 480P and 768P. PicX's public schema pins `resolution` to
`^(480p|720p|1080p)$`, re-confirmed live today:

```
768p -> 422 "String should match pattern '^(480p|720p|1080p)$'"
720p -> 400 "Resolution '720p' is not available for model 'minimax/h3-max'"
```

So the showcase ships at **480p**. Adding `768p` to that regex upstream is a
one-line change and would raise every clip on the site; until then 480p is the
honest ceiling and the copy must not claim HD.

---

## 2. Guardrail: anime style, never anime characters

The brief asks for anime-style content and names Pikachu and Naruto as examples of
what renders well. Those are protected characters — Pokémon Company and Shueisha
respectively — and putting them on a commercial marketplace card is a
right-of-publicity and trademark exposure, not a grey area. Upstream models also
refuse many named-character prompts outright, so a skill built on them fails
intermittently and looks broken.

**What we build instead:** style, not cast. Shonen action linework, chibi
proportions, magical-girl palettes, cel-shaded 90s TV grain, speed lines and
impact frames — all describable, all reproducible, none owned by anyone. Every
prompt in a new skill must be legible as a *style instruction* with no proper
noun in it. Any lane that writes a prompt naming a character, series or studio has
failed its acceptance check.

---

## 3. Workstreams

Lanes own **strictly disjoint files**. No two lanes may write the same path.

### Wave 1 (dispatched now)

**L1 — Real clips on the CDN.** `scripts/generate-showcase-clips.ts` (new),
`src/data/showcase-clips.json` (new, generated). Produces 3 finished clips through
the real API and records their CDN URLs plus provenance. Re-runnable. Reuses
existing paid-for doodle PNGs as source frames so the spend is clips only.
Polls `GET /v1/generations/{id}` because it is an out-of-band asset script — the
**product** stays webhook-only and must not be touched.

**L2 — The showcase surface.** `src/pages/showcase/index.astro` (new),
`src/components/app/ClipTile.astro` (new), `src/styles/showcase.css` (new),
`src/components/app/Sidebar.astro` (nav entry). Reads L1's JSON, renders muted
autoplay-on-hover clips with a real `<video>`, and shows an honest empty state
when the JSON has no entries yet so the two lanes never block each other.

**L3 — Anime-style video skills.** `src/lib/video/skills.ts`,
`src/lib/video/prompts.ts`, two new `src/mastra/skills/<id>/SKILL.md` packages.
Adds style-led video skills under the §2 guardrail, registered in
`VIDEO_SKILL_IDS` so the build-time drift validator accepts them.

### Wave 2 (after wave 1 lands)

**L4 — Model-pin guard.** A `scripts/check-media-models.mjs` that fails the build
if any file under `src/` names a media model id other than the two above, wired
into `pnpm check`. Turns today's owner decision into something a future agent
cannot quietly undo.

**L5 — Video-first tiles.** `SkillCard.astro` plays a looping clip preview for
video skills instead of a still + badge, once L1's clips exist.

**L6 — Copy pass.** Home hero, `/learn`, `/about`: from "make doodles" to "make
doodles move". Blocked on L1 for the same reason as L5 — copy that promises motion
above a wall of stills reads as a lie.

**L7 — Wait-state honesty.** `VIDEO_ESTIMATED_SECONDS = 75` in
`src/lib/video/constants.ts` against a measured 5.3s render. One sample, so this
needs 3-4 more timings at 5s and 15s before the number moves.

---

## 4. Cost model

| Item | PicX credits | Note |
|------|--------------|------|
| One still doodle | 53 | `gpt-image-2` at 1K |
| One second of clip | 30 | h3-max 480p |
| One 5s showcase clip | 150 | |
| **Wave 1 total (3 clips)** | **450** | source frames reused, so no image spend |

User-facing price is unchanged: 1 internal credit per second of clip, 1 per image.

Known upstream reporting bug worth a backend ticket: the video webhook payload and
`GET /v1/generations/{id}` both report `"credits_used": 0` for a clip that account
usage confirms cost 150. Nothing of ours reads that field — refunds use our own
`credits_charged` — but any consumer trusting it under-reports video cost to zero.

---

## 5. Definition of done for wave 1

1. `src/data/showcase-clips.json` holds >= 3 entries, each with a `cdn_url` that
   returns HTTP 200 `video/mp4`, the source doodle URL, the skill id, the mode,
   duration, and the PicX generation id.
2. `/showcase` renders those clips and plays them, and renders an honest empty
   state when the file is empty.
3. At least two new video skills exist, appear in the catalog, and pass the
   build-time per-kind drift validator.
4. `pnpm build` green. No prompt in any new skill names a character, series or
   studio.
5. Nothing committed. The owner commits.
