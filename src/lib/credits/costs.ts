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
 * Credits per generation — flat 1 credit regardless of skill, including
 * multi-image ones like stickers. Simpler pricing than metering by PicX call
 * count; revisit if a specific skill's PicX cost stops being covered by a
 * single credit (see docs/tech-stack.md § "Cost model").
 */
const CREDIT_COSTS: Record<GenerationMode, number> = {
  normal: 1,
  collage: 1,
  "full-body": 1,
  surprise: 1,
  stickers: 1,
  "mood-captions": 1,
  gift: 1,
};

/** New account starter grant — signup bonus. */
export const SIGNUP_GRANT_CREDITS = 5;

export function creditCostForSkill(skillId: string): number {
  if (!isGenerationMode(skillId)) {
    throw new Error(`Unknown skill id "${skillId}" — not in GENERATION_MODES.`);
  }
  return CREDIT_COSTS[skillId];
}

function isGenerationMode(value: string): value is GenerationMode {
  return (GENERATION_MODES as readonly string[]).includes(value);
}
