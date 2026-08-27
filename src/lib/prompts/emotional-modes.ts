/**
 * Emotional Modes — pack prompt builder
 *
 * Recipe: one uploaded photo → 4 SEPARATE square images of the same person,
 * each redrawn through a different emotional lens (Cozy, Chaotic, Dreamy,
 * Moody). The person stays recognisably the same across all four; only the
 * mood, linework energy, palette temperature, composition and background marks
 * change.
 *
 * This is a MULTI-IMAGE PACK: each mood is its own file, not one composite
 * sheet with panels.
 */

import type { PackVariant, PromptInput } from "./index";

/**
 * Build the 4-variant emotional modes pack.
 *
 * NOTE: This skill deliberately ignores input.themeHint and input.styleHint.
 * The product IS the mood — the emotional lens defines the palette and energy,
 * and overlaying the user's selected visual theme would fight it. Precedent:
 * the `faceless` skill does the same (see SKILL_PROMPT_BUILDERS in index.ts).
 */
export function buildEmotionalModes(input: PromptInput): PackVariant[] {
  const subjectContext = input.description
    ? ` The subject context is: ${input.description}. Let it nudge subject matter and props without overriding the mood.`
    : "";

  return [
    {
      label: "Cozy",
      prompt: `Naive marker-and-ink doodle portrait. Bold clean hand-drawn outlines, flat warm colour, visible marker hatching for soft shading. Redraw the person from the uploaded photo through a COZY emotional lens.${subjectContext}

MEDIUM FIRST: This is a hand-drawn doodle — think thick felt-tip marker outlines on paper, flat fills, slightly wobbly warm linework. Correct shapes and proportions of the person (hairstyle, face shape, skin tone, glasses, accessories), never realistic rendering.

MOOD — COZY: Soft rounded linework with gentle weight variation. Warm amber and cream palette — burnt sienna outlines, soft peach skin, honey-gold highlights. Dress the person in snug knitwear or a soft hoodie. Composition is close and centered, intimate framing. Background: scattered tiny comfort props — a steaming mug, a small candle flame, a curled-up cat silhouette, soft dotted warmth lines rising like steam. Overall feeling: a quiet Sunday morning under blankets.

PRESERVE: The person's recognisable hairstyle, face shape, skin tone, expression, and any visible accessories (glasses, earrings, piercings). These must be consistent across all four mood images.

ABSOLUTE CONSTRAINTS: No photorealism, no 3D rendering, no smooth gradient shading, no rendered hair strands, no vector/comic-book rendering, no watermarks, no text, no captions, no logos. Square 1:1 format. Single illustrated figure, not a photo.`,
    },
    {
      label: "Chaotic",
      prompt: `Naive marker-and-ink doodle portrait. Bold scratchy hand-drawn outlines with deliberate overshooting strokes, flat saturated colour, visible frantic marker hatching. Redraw the person from the uploaded photo through a CHAOTIC emotional lens.${subjectContext}

MEDIUM FIRST: This is a hand-drawn doodle — jittery scratchy ink that overshoots corners, double-struck outlines, energetic cross-hatching that breaks containment. Correct shapes of the person (hairstyle, face shape, skin tone, accessories), never realistic rendering.

MOOD — CHAOTIC: Uneven jittery linework that vibrates with restless energy — lines overshoot, cross, and redouble. Clashing saturated palette — electric magenta meets acid green meets hot orange, black ink at maximum contrast. Off-center dynamic composition, the figure tilted 5–10°, crowded frame. Background: frantic motion scribbles, tiny lightning bolt doodles, scattered exclamation marks, speed lines radiating outward, crumpled energy. Overall feeling: triple-espresso Monday morning, everything happening at once.

PRESERVE: The person's recognisable hairstyle, face shape, skin tone, expression, and any visible accessories (glasses, earrings, piercings). These must be consistent across all four mood images.

ABSOLUTE CONSTRAINTS: No photorealism, no 3D rendering, no smooth gradient shading, no rendered hair strands, no vector/comic-book rendering, no watermarks, no text, no captions, no logos. Square 1:1 format. Single illustrated figure, not a photo.`,
    },
    {
      label: "Dreamy",
      prompt: `Naive marker-and-ink doodle portrait. Soft broken hand-drawn outlines, pale washed flat colour, light marker strokes with breathing white space. Redraw the person from the uploaded photo through a DREAMY emotional lens.${subjectContext}

MEDIUM FIRST: This is a hand-drawn doodle — light feathery marker lines that fade and break mid-stroke, minimal ink weight, airy and incomplete in a deliberate poetic way. Correct shapes of the person (hairstyle, face shape, skin tone, accessories), never realistic rendering.

MOOD — DREAMY: Light broken linework that floats and dissolves at edges — barely-there outlines that let the white breathe through. Pale washed palette — lavender, powder blue, soft blush pink, diluted gold. Floaty composition with generous negative space, the figure slightly elevated as if weightless. Background: tiny scattered stars, wispy cloud shapes, gentle floating sparkle dots, a crescent moon sliver, thin trailing spirals. Overall feeling: drifting half-asleep under a sky of soft constellations.

PRESERVE: The person's recognisable hairstyle, face shape, skin tone, expression, and any visible accessories (glasses, earrings, piercings). These must be consistent across all four mood images.

ABSOLUTE CONSTRAINTS: No photorealism, no 3D rendering, no smooth gradient shading, no rendered hair strands, no vector/comic-book rendering, no watermarks, no text, no captions, no logos. Square 1:1 format. Single illustrated figure, not a photo.`,
    },
    {
      label: "Moody",
      prompt: `Naive marker-and-ink doodle portrait. Heavy dark hand-drawn outlines with thick ink weight, restrained flat colour, dense deliberate marker hatching for shadow. Redraw the person from the uploaded photo through a MOODY emotional lens.${subjectContext}

MEDIUM FIRST: This is a hand-drawn doodle — thick confident ink strokes with serious weight, bold black outlines dominating, purposeful heavy hatching in shadow areas. Correct shapes of the person (hairstyle, face shape, skin tone, accessories), never realistic rendering.

MOOD — MOODY: Heavy high-contrast linework — thick confident strokes with dramatic weight variation, bold shadows. Restrained cool palette — charcoal, slate blue, muted teal, desaturated burgundy accents against deep ink-black. Tight dramatic composition with deliberate negative space used for tension — close crop, the figure emerging from darkness. Background: minimal — heavy ink washes in corners, a few thin rain-streak lines, small scattered dot clusters suggesting distant city lights. Overall feeling: standing alone on a rooftop at 2 AM, streetlights below.

PRESERVE: The person's recognisable hairstyle, face shape, skin tone, expression, and any visible accessories (glasses, earrings, piercings). These must be consistent across all four mood images.

ABSOLUTE CONSTRAINTS: No photorealism, no 3D rendering, no smooth gradient shading, no rendered hair strands, no vector/comic-book rendering, no watermarks, no text, no captions, no logos. Square 1:1 format. Single illustrated figure, not a photo.`,
    },
  ];
}
