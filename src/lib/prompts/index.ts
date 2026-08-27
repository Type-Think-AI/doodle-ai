/* Per-skill prompt builders, one module per skill.
 *
 * Why these live here and not in doodle-constants.ts: each new skill is
 * authored as an isolated unit (its SKILL.md package plus its prompt module),
 * so several skills can be written in parallel without colliding in one
 * shared file. doodle-constants.ts still owns the ORIGINAL seven skills'
 * builders and the shared pools (THEMES, pick, pickMany) they depend on.
 *
 * This barrel exists to give generate-doodle.ts one uniform call shape. The
 * individual builders were authored with slightly different signatures — the
 * adapters below normalise them rather than rewriting working prompt bodies,
 * and they are also the right home for the small amount of real input
 * derivation a builder needs (e.g. deciding whether a pet photo includes its
 * owner).
 */

import { buildMiniMePrompt } from "./chibi-mini-me";
import { buildCrayonPrompt } from "./crayon-self";
import { buildCouplePrompt } from "./couple-doodle";
import { buildPetPortraitPrompt } from "./pet-portrait";
import { buildFacelessPortraitPrompt } from "./faceless-portrait";

/** Everything a prompt builder is allowed to see. Never credentials. */
export interface PromptInput {
  /** Full sentence form, e.g. "Apply this visual style distinctly: <hint>". */
  themeHint: string;
  /** The raw THEMES[].styleHint, for builders that phrase the clause themselves. */
  styleHint: string;
  /** Optional free-text guidance from the user's message. */
  description?: string;
}

export type PromptBuilder = (input: PromptInput) => string;

/**
 * Words that indicate a pet photo also contains its owner. Deliberately
 * conservative: a false negative just yields a pet-only portrait (still a
 * correct, useful result), whereas a false positive asks the model to draw a
 * human who isn't in the photo — a much worse failure, and one the model
 * cannot recover from.
 */
const OWNER_HINTS = [
  "me and",
  "and me",
  "with me",
  "and i ",
  "us together",
  "owner",
  "holding",
  "my lap",
  "hugging",
  "together",
] as const;

export function mentionsOwner(description?: string): boolean {
  if (!description) return false;
  const text = ` ${description.toLowerCase()} `;
  return OWNER_HINTS.some((hint) => text.includes(hint));
}

/**
 * Prompt builders for the skills authored as standalone modules. Keyed by the
 * same generation-mode id as GENERATION_MODES / the skills' `metadata.id`, so
 * generate-doodle.ts can resolve a builder by id instead of growing a longer
 * switch for every new skill.
 */
export const SKILL_PROMPT_BUILDERS: Record<string, PromptBuilder> = {
  "mini-me": (input) => buildMiniMePrompt({ themeHint: input.themeHint, description: input.description }),
  crayon: (input) => buildCrayonPrompt({ themeHint: input.themeHint, description: input.description }),
  couple: (input) => buildCouplePrompt(input.description),
  // Takes the raw styleHint because it phrases its own "Apply this visual
  // theme:" clause — passing the pre-wrapped themeHint would double it up.
  pet: (input) => buildPetPortraitPrompt(mentionsOwner(input.description), input.styleHint),
  // Deliberately ignores the theme: this skill's muted editorial palette is
  // the product, and the louder visual themes fight it.
  faceless: () => buildFacelessPortraitPrompt(),
};

export function promptBuilderFor(skillId: string): PromptBuilder | undefined {
  return SKILL_PROMPT_BUILDERS[skillId];
}
