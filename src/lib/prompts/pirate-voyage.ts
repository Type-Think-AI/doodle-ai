/**
 * Pirate Voyage prompt builder — anime image skill.
 *
 * Craft signature taken from docs/anime-style-research.md Part 3 ("Pirate
 * voyage"): shonen-action base, bold expressive outlines, exaggerated rubbery
 * elastic limb proportions, bright tropical-island palette with warm
 * sea-and-sky blues, heavy background motion lines, a ship deck under open sky.
 *
 * GENRE, NOT FRANCHISE. Every string here names the genre and the look — never
 * a series, studio, artist or character. That is deliberate and load-bearing on
 * two counts: upstream models refuse many named-character prompts (so the skill
 * would fail intermittently and read as our bug), and a named character's
 * likeness is the actual copyright exposure, not the style. See §1 of
 * docs/anime-expansion-brief.md.
 */

import type { PromptInput } from "./index";

export function buildPirateVoyage(input: PromptInput): string {
  const descriptionClause = input.description
    ? ` Extra direction from the user, applied only to costume details, props and setting — never to the face: ${input.description}.`
    : "";

  return `Bold cel-shaded anime illustration in the high-seas adventure genre. Crisp matte ink outlines of varying weight holding every form, two or three discrete flat shadow blocks instead of smooth gradients, saturated fills that stay readable at thumbnail size. Hand-drawn animation artwork, never a photograph and never a 3D render.

Transform the person in the uploaded photo into ONE square adventure key illustration: the same person, redrawn as the confident captain of a sailing crew, standing on the wooden deck of a tall ship under a wide open sky.

LIKENESS ANCHORING — the person must stay immediately recognisable:
- Preserve their hairstyle, hair colour and length, redrawn as bold graphic hair shapes with clean sectioned strands.
- Preserve face shape, skin tone and distinguishing features (freckles, moles, facial hair).
- Preserve glasses, piercings and any jewellery they are wearing.
- Preserve their expression's mood, translated into anime facial grammar: large expressive eyes with a bright specular highlight, a small simplified nose, a confident open smile.
- Standard anime proportions, roughly seven to eight heads tall — not chibi.

GENRE STYLING:
- Seafaring adventure costume: a long open coat with rolled sleeves, a wide sash at the waist, a loose shirt, cuffed boots, a shoulder strap. Invented outfit, nothing copied from any existing show or its insignia.
- Elastic, rubbery, slightly exaggerated limb proportions in the pose — an arm thrown wide, a boot planted on a crate — the stretchy comedic energy this genre is built on.
- Bright tropical-island palette: warm sea-and-sky blues, sun-warm sand, coral and sail-canvas cream.
- Deck props behind them: rigging ropes, a barrel, a furled sail, a distant island silhouette on the horizon.
- Heavy motion lines drawn on the BACKGROUND (sky and sea streaks) while the figure itself stays in sharp focus — the anime convention, not streaks across the character.

Composition: the figure is centred, three-quarter to full body, low camera angle looking slightly up so they read as heroic. Salt spray and a couple of gulls as small accents in the negative space.

${input.themeHint}${descriptionClause}

HARD NEGATIVES — do NOT do any of the following:
- No photorealism, no photographic skin texture, no 3D render, no smooth airbrushed gradient shading.
- No western comic-book inking or vector-clipart look.
- Do NOT draw, imitate or substitute any existing character from any published series, film or game — this is the person in the photo, in genre costume.
- No emblems, crests, jolly-roger marks, logos, badges or insignia of any kind.
- No weapons pointed at the viewer, no blood, no gore.
- No watermarks, no text, no captions, no lettering anywhere in the image.`;
}
