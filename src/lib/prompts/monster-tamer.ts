/**
 * Monster Tamer prompt builder — anime image skill.
 *
 * Craft signature taken from docs/anime-style-research.md Part 3 ("Monster
 * tamer"): bright shonen-adventure base plus creature/mascot design language —
 * clean rounded friendly outlines, a readable silhouette at coin size, ONE clear
 * signature anatomy feature, a limited high-identity palette per creature,
 * rounded shape language reading as friendly rather than dangerous.
 *
 * The creature must be ORIGINAL. That is both the legal line (§1 of
 * docs/anime-expansion-brief.md — no series, studio, artist or character noun in
 * any string) and the better product: an invented companion designed around the
 * user's own colours is more personal than a copy of one that already exists.
 */

import type { PromptInput } from "./index";

export function buildMonsterTamer(input: PromptInput): string {
  const descriptionClause = input.description
    ? ` Extra direction from the user, applied to the creature's element, colours and the setting — never to the person's face: ${input.description}.`
    : ` No creature direction was given, so invent one: pick a single element (leaf, flame, water, stone, spark or cloud) and design the companion around it.`;

  return `Bright cel-shaded anime illustration in the creature-companion adventure genre. Clean rounded ink outlines, flat discrete colour fills with two soft shadow blocks, a cheerful high-key palette, everything readable at thumbnail size. Hand-drawn animation artwork, never a photograph and never a 3D render.

Transform the person in the uploaded photo into ONE square two-shot illustration: the same person, redrawn as a young creature tamer on an outdoor adventure, standing beside ONE small original creature companion.

LIKENESS ANCHORING — the person must stay immediately recognisable:
- Preserve their hairstyle, hair colour and length, redrawn as bold graphic anime hair shapes.
- Preserve face shape, skin tone and distinguishing features (freckles, moles, facial hair).
- Preserve glasses and piercings if they are wearing them.
- Translate their expression into anime facial grammar: large bright eyes with a clear specular highlight, a small simplified nose, an eager open smile.
- Standard anime proportions, roughly seven to eight heads tall — not chibi.
- Adventuring outfit: a light hooded jacket, shorts or cargo trousers, sturdy boots, a small shoulder satchel. Invented, plain, no emblem or symbol on it.

THE CREATURE — invent it from scratch, following mascot design discipline:
- Small enough to stand at knee height or perch on a shoulder.
- ONE strong readable silhouette that still reads at coin size — no busy outline.
- Rounded, soft shape language throughout so it reads friendly and safe, never threatening.
- Exactly ONE clear signature anatomy feature that gives it identity: an oversized leaf tail, a curled ember crest, a pair of stubby cloud wings, a stone shell ridge or similar — one, not several.
- A limited three-colour palette of its own, chosen to sit next to (not clash with) the person's hair colour.
- Simple internal detail: two large friendly eyes, a tiny mouth, small rounded paws or fins.
- It must be an ORIGINAL animal-like creature invented for this image, not any creature that already exists in a published series, film or game.

Composition: the person on one side, the creature on the other, both facing the viewer and clearly interacting — a hand reaching toward it or the creature leaning against their leg. Sunny outdoor setting behind them: a grass path, low rolling hills, a few round trees, a bright sky with soft flat clouds. A couple of small sparkle accents in the negative space.

${input.themeHint}${descriptionClause}

HARD NEGATIVES — do NOT do any of the following:
- No photorealism, no photographic skin texture, no 3D render, no smooth airbrushed gradient shading.
- No western comic-book inking or vector-clipart look.
- Do NOT draw, imitate or substitute any creature, mascot or character from any published series, film or game — the companion is newly invented here.
- Do NOT add a second creature, a crowd, or any other person.
- No capture devices, no cages, no collars, no leashes, no chains — the companion is a friend, not a captive.
- No emblems, badges, logos or insignia anywhere.
- No watermarks, no text, no captions, no lettering anywhere in the image.`;
}
