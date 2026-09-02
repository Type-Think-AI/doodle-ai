/* Per-skill credit pricing. Resolved server-side from the skill id only —
 * never from a client-supplied cost, so a tampered request can change what
 * gets generated but never what gets charged.
 *
 * Keyed with `Record<GenerationMode, number>` rather than a switch: a new
 * entry in GENERATION_MODES (src/lib/doodle-constants.ts) that has no price
 * here fails `tsc` — "missing property" — the same way src/lib/skill-loader.ts
 * fails the build on a skill id that isn't wired into GENERATION_MODES.
 * There is no way to ship a runnable skill with an unpriced mode.
 */
import { GENERATION_MODES, type GenerationMode } from "../doodle-constants";

/**
 * Credits charged per generated IMAGE.
 *
 * Pricing is metered per image rather than per user action because PicX bills
 * per call and exposes no `n` parameter (verified against its live OpenAPI), so
 * a pack skill genuinely costs one upstream call per frame. The previous flat
 * 1-credit-per-run rate predicted its own end: it only held while every skill
 * produced exactly one image.
 */
export const CREDITS_PER_IMAGE = 1;

/**
 * How many images one run of each skill produces — i.e. how many PicX calls it
 * makes. Single-image skills are 1; pack skills return a frame per variant and
 * MUST match the length of the array their PackPromptBuilder returns
 * (src/lib/prompts/index.ts). generate-doodle.ts asserts that agreement at run
 * time, so the two can never silently drift into mischarging.
 */
const IMAGES_PER_RUN: Record<GenerationMode, number> = {
  normal: 1,
  collage: 1,
  "full-body": 1,
  surprise: 1,
  stickers: 1,
  "mood-captions": 1,
  gift: 1,
  "mini-me": 1,
  crayon: 1,
  couple: 1,
  pet: 1,
  faceless: 1,
  /* Free-tool landing page skills (Aug 2026). Single image each — a coloring
     page is one printable sheet and a doodle idea is one drawing, so neither is
     a pack. */
  coloring: 1,
  idea: 1,
  /* Pack skills — one separate image per variant, not one composite sheet.
     A sheet cannot be cut into usable sticker/season files, which is the whole
     reason these are packs (see docs/skills-research-2026-08.md). */
  seasonal: 4,
  moods: 4,
  expressions: 9,
  "style-roll": 4,
  childhood: 4,
  festival: 6,
  webtoon: 4,
  /* Single-image gifting skills. */
  family: 1,
  occupation: 1,
  /* Anime-genre skills (Sep 2026). One key illustration each — the appeal is a
     single strong hero image to post, not a set, so none of these is a pack. */
  pirate: 1,
  ninja: 1,
  tamer: 1,
};

/**
 * New account starter grant — signup bonus.
 *
 * 10 rather than 5 because pricing is now per image: at 5 credits a new account
 * could not run Expression Pack (9) at all and had only 1 credit left after any
 * 4-image pack, so the pack skills — the thing that differentiates this
 * catalogue — were unreachable on the free tier. 10 covers the largest pack with
 * one credit to spare, or two 4-image packs.
 */
export const SIGNUP_GRANT_CREDITS = 10;

/**
 * The skills that produce more than one image. Exported as a literal tuple so
 * src/lib/prompts/index.ts can key its pack-builder registry on it: an id
 * listed here with no registered PackPromptBuilder is then a `tsc` error rather
 * than a silently empty registry that makes the skill fall through to the
 * generic single-image prompt at run time.
 */
export const PACK_SKILL_IDS = ["moods", "seasonal", "expressions", "style-roll", "childhood", "festival", "webtoon"] as const;
export type PackSkillId = (typeof PACK_SKILL_IDS)[number];

/* Keeps PACK_SKILL_IDS honest against the pricing table above: a pack id whose
   IMAGES_PER_RUN is 1 (or a >1 entry missing from the list) is a contradiction
   between "charges for N images" and "produces N images", so fail at import
   rather than mischarge. Cheap enough to run unconditionally at module load. */
for (const id of PACK_SKILL_IDS) {
  if (IMAGES_PER_RUN[id] <= 1) {
    throw new Error(`"${id}" is listed in PACK_SKILL_IDS but priced for a single image.`);
  }
}
for (const [id, count] of Object.entries(IMAGES_PER_RUN)) {
  if (count > 1 && !(PACK_SKILL_IDS as readonly string[]).includes(id)) {
    throw new Error(`"${id}" is priced for ${count} images but missing from PACK_SKILL_IDS.`);
  }
}

/** Images produced by one run of this skill. */
export function imageCountForSkill(skillId: string): number {
  assertGenerationMode(skillId);
  return IMAGES_PER_RUN[skillId];
}

/**
 * True when one run of this skill produces more than one image.
 *
 * Callers that can only deliver a single image per unit of work must refuse
 * these rather than charge the full run cost — the batch pipeline
 * (src/lib/batch/run.ts) is exactly that case.
 */
export function isPackSkill(skillId: string): boolean {
  return imageCountForSkill(skillId) > 1;
}

/**
 * Total credits for one run of this skill: images x per-image rate.
 *
 * NOTE for batch callers: this is the cost of one COMPLETE run, so for a pack
 * skill it already includes every frame. Treating it as "cost per batch item"
 * stays correct only for skills where isPackSkill() is false.
 */
export function creditCostForSkill(skillId: string): number {
  return imageCountForSkill(skillId) * CREDITS_PER_IMAGE;
}

function assertGenerationMode(value: string): asserts value is GenerationMode {
  if (!(GENERATION_MODES as readonly string[]).includes(value)) {
    throw new Error(`Unknown skill id "${value}" — not in GENERATION_MODES.`);
  }
}
