/**
 * Seasonal Pack — prompt builder (multi-image pack)
 *
 * Recipe: one uploaded photo → four SEPARATE square doodle images of the same
 * person, one per season. Each image changes ONLY the seasonal layer (clothing,
 * palette, background props, overlay doodles) while keeping the person fully
 * recognisable across the set.
 *
 * This is a pack skill: it returns PackVariant[], one entry per image.
 * generate-doodle.ts runs one API call per variant in parallel; total cost
 * is 4 credits (one per image).
 */

import type { PackVariant, PromptInput } from "./index";

// ---- Shared medium preamble (front-loaded to anchor the model) ----

const MEDIUM_PREAMBLE = `Naive marker-and-ink doodle illustration. Bold clean hand-drawn outlines, flat cheerful colour with visible marker hatching for shading, warm-white/cream ground. Playful slightly exaggerated proportions, simplified facial features.`;

// ---- Shared negative constraints ----

const NEGATIVES = `ABSOLUTE CONSTRAINTS: No photorealism, no photographic skin texture, no 3D render, no smooth gradient shading, no rendered fur or hair strands, no vector-art or comic-book rendering, no watermarks, no logos, no text or captions unless explicitly stated. The result is clearly hand-drawn doodle artwork.`;

// ---- Shared identity-preservation clause ----

const IDENTITY = `Preserve the person's recognisable hairstyle, face shape, skin tone, expression, and accessories — correct shapes, never realistic rendering. The character must be obviously the same person across all four seasonal images.`;

/**
 * Build the generation prompts for the Seasonal Pack skill.
 *
 * Returns exactly 4 PackVariant objects (Spring, Summer, Autumn, Winter), each
 * with a complete standalone prompt for /v1/images/edit.
 */
export function buildSeasonalPack(input: PromptInput): PackVariant[] {
  return [
    {
      label: "Spring",
      prompt: `${MEDIUM_PREAMBLE}

Transform the uploaded photo into a hand-drawn doodle character in a spring scene. ${IDENTITY}

SEASONAL LAYER — SPRING:
- Clothing: light cardigan or flowing blouse, pastel scarf, canvas tote with flower sketch.
- Palette: soft cherry-blossom pink, fresh mint green, pale lavender, buttery cream.
- Background: warm-white ground with scattered small falling petals, a few slender tree branches with tiny blossoms, distant puddle reflections drawn as simple ovals.
- Overlay doodles: small four-petal flower buds, dotted trails suggesting a breeze, tiny sprout shoots, one or two butterflies sketched in single continuous line.

Apply this visual style distinctly: ${input.themeHint}

${NEGATIVES}`,
    },
    {
      label: "Summer",
      prompt: `${MEDIUM_PREAMBLE}

Transform the uploaded photo into a hand-drawn doodle character in a summer scene. ${IDENTITY}

SEASONAL LAYER — SUMMER:
- Clothing: sunglasses pushed up into hair, loose sleeveless top, shorts or sundress, sandals suggested by simple line shapes.
- Palette: warm saturated coral, golden yellow, deep sky-blue, bright tangerine.
- Background: warm-white ground with bold sun-ray lines radiating from a corner, simple wave scribbles at the bottom edge, a tiny ice-cream cone or popsicle doodled nearby.
- Overlay doodles: thick sun-burst sparkles, wavy heat-shimmer lines, small star-shaped splashes, single-stroke palm leaf silhouettes.

Apply this visual style distinctly: ${input.themeHint}

${NEGATIVES}`,
    },
    {
      label: "Autumn",
      prompt: `${MEDIUM_PREAMBLE}

Transform the uploaded photo into a hand-drawn doodle character in an autumn scene. ${IDENTITY}

SEASONAL LAYER — AUTUMN:
- Clothing: chunky knit scarf, layered jacket or oversized sweater, ankle boots sketched with bold outlines, optional beanie hat.
- Palette: deep amber, warm rust-orange, mustard gold, muted burgundy, chocolate brown.
- Background: warm-white ground with a scattering of falling leaves (simple maple and oak shapes in two-tone flat fills), thin bare branch silhouettes at the upper edge.
- Overlay doodles: spiralling leaf trails, tiny acorn shapes, short diagonal motion lines suggesting wind, small steaming mug sketched beside the character.

Apply this visual style distinctly: ${input.themeHint}

${NEGATIVES}`,
    },
    {
      label: "Winter",
      prompt: `${MEDIUM_PREAMBLE}

Transform the uploaded photo into a hand-drawn doodle character in a winter scene. ${IDENTITY}

SEASONAL LAYER — WINTER:
- Clothing: cosy knitted beanie with a pom-pom, thick scarf wrapped high, puffy jacket or wool coat, mittens suggested by rounded shapes.
- Palette: cool pale blue, soft lavender-grey, crisp white, silver accents, warm blush on cheeks and nose.
- Background: warm-white ground with simple six-pointed snowflake doodles drifting down, a thin ground-line of rounded snow mounds, faint bare-tree branch silhouettes.
- Overlay doodles: individual snowflakes in varied sizes (drawn, not rendered), tiny sparkle bursts, breath-cloud puffs near the character's face, short dash lines suggesting falling snow.

Apply this visual style distinctly: ${input.themeHint}

${NEGATIVES}`,
    },
  ];
}
