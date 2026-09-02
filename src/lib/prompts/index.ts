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
import { buildColoringPagePrompt } from "./coloring-page";
import { buildDoodleIdeaPrompt } from "./doodle-idea";
import { buildSeasonalPack } from "./seasonal-pack";
import { buildEmotionalModes } from "./emotional-modes";
import { buildExpressionSheet } from "./expression-sheet";
import { buildStyleRoll } from "./style-roll";
import { buildChildhoodMe } from "./childhood-me";
import { buildFestivalPack } from "./festival-pack";
import { buildWebtoonCaricature } from "./webtoon-caricature";
import { buildFamilyPortrait } from "./family-portrait";
import { buildOccupationCaricature } from "./occupation-caricature";
import { buildPirateVoyage } from "./pirate-voyage";
import { buildNinjaVillage } from "./ninja-village";
import { buildMonsterTamer } from "./monster-tamer";
import type { PackSkillId } from "../credits/costs";

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
 * One image inside a multi-image pack skill.
 *
 * A pack skill produces several SEPARATE images from a single user action —
 * not one sheet containing several panels. That distinction is the whole point:
 * a messaging sticker set, a seasonal set or an expression set is only usable
 * if each frame is its own file, which a single composite image can never be.
 */
export interface PackVariant {
  /**
   * Short human label for this frame, e.g. "Autumn". Used for the image's alt
   * text and for ordering; it is NOT automatically drawn into the image — a
   * variant that wants visible lettering must say so in its own prompt.
   */
  label: string;
  /** The complete instruction for this one image. */
  prompt: string;
}

/**
 * A pack skill's builder. Returns one entry per image, in display order.
 *
 * PicX exposes no `n` parameter (verified against its live OpenAPI), so
 * generate-doodle.ts runs one call per variant, in parallel. Cost therefore
 * scales with the array's length — see src/lib/credits/costs.ts.
 */
export type PackPromptBuilder = (input: PromptInput) => PackVariant[];

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
  family: (input) => buildFamilyPortrait(input),
  // Powers the coloring-page tool cluster. Takes the wrapped themeHint like the
  // other single-image builders; the builder itself keeps the theme subordinate
  // to the no-colour rule, since a loud palette is the one thing that would
  // break a page you are meant to colour in yourself.
  coloring: (input) =>
    buildColoringPagePrompt({ themeHint: input.themeHint, description: input.description }),
  // Powers the idea/prompt tool pages. `description` is the idea the visitor
  // typed and is the whole input — unlike `surprise`, which ignores it.
  idea: (input) =>
    buildDoodleIdeaPrompt({ themeHint: input.themeHint, description: input.description }),
  // The occupation is carried in `description` — the tool's schema already
  // documents that field as free-text guidance, and the builder falls back to a
  // neutral setting rather than guessing a profession when it is absent.
  occupation: (input) => buildOccupationCaricature(input),
  /* Anime-genre image skills (Sep 2026). Each takes the wrapped themeHint as a
     subordinate palette clause: the anime craft signature is the product, and
     the palette theme is a second dial on top of it — same treatment as
     `family`, not the theme-ignoring treatment `faceless` needs. Every string
     in these builders names a GENRE and a LOOK, never a series, studio, artist
     or character (docs/anime-expansion-brief.md §1). */
  pirate: (input) => buildPirateVoyage(input),
  ninja: (input) => buildNinjaVillage(input),
  tamer: (input) => buildMonsterTamer(input),
};

export function promptBuilderFor(skillId: string): PromptBuilder | undefined {
  return SKILL_PROMPT_BUILDERS[skillId];
}

/**
 * Pack prompt builders for multi-image skills (moods, seasonal, expressions).
 * These return an array of PackVariant — one image is generated per variant.
 * Keyed by the same id as GENERATION_MODES and the skill's metadata.id.
 *
 * TODO: Wire the actual prompt builders when the pack skills are fully authored.
 * For now returns undefined so generate-doodle falls through to the legacy
 * per-mode switch, which is how these shipped before the registry existed.
 */
/**
 * Prompt builders for the PACK skills — the ones that produce several separate
 * images from a single run.
 *
 * Keyed with `Record<PackSkillId, PackPromptBuilder>` on purpose: PackSkillId
 * comes from the pricing table (src/lib/credits/costs.ts), so a skill priced
 * for N images with no builder registered here fails `tsc` with a missing
 * property. This registry shipped empty once, which `tsc` could not catch while
 * it was typed `Record<string, ...>` — every pack skill silently fell through to
 * the generic single-image prompt.
 */
export const SKILL_PACK_BUILDERS: Record<PackSkillId, PackPromptBuilder> = {
  seasonal: (input) => buildSeasonalPack(input),
  // Deliberately ignores the visual theme: the mood IS this skill's product,
  // and a loud theme fights the emotional lens. Same reasoning as `faceless`.
  moods: (input) => buildEmotionalModes(input),
  expressions: (input) => buildExpressionSheet(input),
  // Ignores the theme too, for the same class of reason as `moods`: the four
  // MEDIUMS are this skill's product, and one shared visual theme would flatten
  // them back into a single look.
  "style-roll": (input) => buildStyleRoll(input),
  childhood: (input) => buildChildhoodMe(input),
  festival: (input) => buildFestivalPack(input),
  webtoon: (input) => buildWebtoonCaricature(input),
};

export function packBuilderFor(skillId: string): PackPromptBuilder | undefined {
  return SKILL_PACK_BUILDERS[skillId as PackSkillId];
}
