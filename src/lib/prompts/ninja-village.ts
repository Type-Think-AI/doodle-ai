/**
 * Ninja Village prompt builder — anime image skill.
 *
 * Craft signature taken from docs/anime-style-research.md Part 3 ("Ninja
 * village"): shonen-action base over a stealth/earth-tone world, gear-heavy
 * character vocabulary, dense crosshatch shading, muted sandy palette with ONE
 * saturated glowing accent, the hands-together focusing gesture before a power
 * effect, background speed lines and smoke.
 *
 * GENRE, NOT FRANCHISE. No series, studio, artist or character noun appears in
 * any string here — see §1 of docs/anime-expansion-brief.md. Named-character
 * prompts get refused upstream (intermittent failures that read as our bug) and
 * a character likeness is the real copyright exposure, not the style.
 */

import type { PromptInput } from "./index";

export function buildNinjaVillage(input: PromptInput): string {
  const descriptionClause = input.description
    ? ` Extra direction from the user, applied only to gear, the glow colour and the setting — never to the face: ${input.description}.`
    : "";

  return `Detailed cel-shaded anime illustration in the shadow-warrior action genre. Fine matte ink outlines with dense crosshatch shading in the shadow blocks, flat discrete colour fills, one saturated glowing accent against an otherwise muted image. Hand-drawn animation artwork, never a photograph and never a 3D render.

Transform the person in the uploaded photo into ONE square action key illustration: the same person, redrawn as a rooftop stealth warrior of a mountain village, caught in the charged beat right before they release a technique.

LIKENESS ANCHORING — the person must stay immediately recognisable:
- Preserve their hairstyle, hair colour and length, redrawn as bold graphic anime hair with clean sectioned strands and a few loose spikes.
- Preserve face shape, skin tone and distinguishing features (freckles, moles, facial hair).
- Preserve glasses and piercings if they are wearing them.
- Translate their expression into anime facial grammar: large focused eyes with a sharp specular highlight, a small simplified nose, a set determined mouth.
- Athletic standard anime proportions, roughly seven to eight heads tall — not chibi.

GENRE STYLING:
- Stealth gear, entirely invented: wrapped forearms and shins, a high-collar sleeveless tunic, a utility belt with pouches, a plain cloth headband tied at the back, a loose scarf caught in the wind. No emblem, crest or symbol on any of it.
- The action beat: both hands pressed together in front of the chest in a focusing gesture, with a soft rim glow gathering around the hands and along the forearms.
- Muted earth-tone palette — sandy neutrals, slate grey, weathered olive and dusty brown — with exactly ONE saturated accent colour used for the gathering glow and nothing else.
- Setting: tiled rooftops of a mountain village at dusk, pine silhouettes and a distant cliff face behind, low drifting smoke across the tiles.
- Speed lines drawn on the BACKGROUND radiating outward while the figure itself stays in sharp focus — the anime convention, not streaks across the character.

Composition: the figure is centred, three-quarter body, camera slightly low, a few loose leaves and small stones lifting off the tiles around their feet from the gathering energy.

${input.themeHint}${descriptionClause}

HARD NEGATIVES — do NOT do any of the following:
- No photorealism, no photographic skin texture, no 3D render, no smooth airbrushed gradient shading.
- No western comic-book inking or vector-clipart look.
- Do NOT draw, imitate or substitute any existing character from any published series, film or game — this is the person in the photo, in genre costume.
- No clan symbols, crests, badges, logos or insignia of any kind on the gear or headband.
- No blades pointed at the viewer, no blood, no wounds, no gore.
- No watermarks, no text, no captions, no lettering anywhere in the image.`;
}
