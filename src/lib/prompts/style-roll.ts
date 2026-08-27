/**
 * Style Roll — pick 4 — pack prompt builder
 *
 * Recipe: one uploaded photo → 4 SEPARATE square images of the SAME person,
 * each rendered in a materially DIFFERENT hand-drawn illustration medium.
 * The user picks their favourite style from the set.
 *
 * This directly addresses the #1 recurring complaint that a single AI roll
 * is a lottery: 4 takes turn a bad roll from a refund into a choice.
 *
 * Character consistency strategy: same person (hairstyle, hair colour, face
 * shape, skin tone, accessories, outfit) and same head-and-shoulders framing
 * on a warm-white ground in every variant. ONLY the drawing medium changes.
 *
 * NOTE: This skill deliberately ignores input.themeHint and input.styleHint.
 * The product IS the medium variation — a visual theme would flatten the four
 * distinct styles into one uniform look, defeating the purpose.
 * Precedent: `faceless` and `moods` also ignore the theme for the same reason
 * (see SKILL_PROMPT_BUILDERS / SKILL_PACK_BUILDERS in index.ts).
 */

import type { PackVariant, PromptInput } from "./index";

// ---- Shared identity clause (repeated verbatim in every prompt) ----

const IDENTITY = `Keep the SAME character in every image of this set: same hairstyle and hair colour, same face shape and proportions, same skin tone, same glasses or earrings or accessories if present, same outfit and outfit colours. Correct shapes from the photo — never realistic rendering.`;

// ---- Shared framing clause ----

const FRAMING = `Head-and-shoulders subject, centred in frame, plain warm-white background. Square 1:1 aspect ratio.`;

// ---- Shared negative constraints ----

const NEGATIVES = `ABSOLUTE CONSTRAINTS: No photorealism, no photographic skin texture, no 3D render, no smooth gradient shading, no rendered individual hair strands, no vector-art or comic-book rendering, no watermarks, no text, no logos. The result is clearly hand-drawn artwork in the specific medium described above.`;

/**
 * Build the 4-variant style roll pack.
 *
 * Each variant opens by naming its own medium explicitly and concretely —
 * this is the whole point of the skill. Unlike other pack skills there is NO
 * shared medium preamble; each prompt is self-contained.
 *
 * Returns exactly 4 PackVariant objects: Marker, Crayon, Ink Sketch, Watercolour.
 */
export function buildStyleRoll(input: PromptInput): PackVariant[] {
  const descriptionClause = input.description
    ? ` Additional context for outfit or props: ${input.description}.`
    : "";

  return [
    {
      label: "Marker",
      prompt: `Bold felt-tip marker illustration on heavyweight sketch paper — thick confident outlines with rounded stroke endings, flat cheerful colour fills with visible directional marker hatching for shading, slight colour bleed where strokes overlap, warm saturated palette. The linework is playful and slightly wobbly, with intentional overshoots at corners that give it a hand-drawn spontaneity.

Transform the uploaded photo into this marker illustration style. ${IDENTITY}${descriptionClause}

${FRAMING}

${NEGATIVES}`,
    },
    {
      label: "Crayon",
      prompt: `Children's wax-crayon drawing on textured cartridge paper — soft waxy strokes with visible paper grain breaking through, heavy pressure colour layering, rounded imprecise outlines with a slightly shaky childlike hand. Colours are rich and slightly muddy where layered (the way real crayons blend), with white paper peeking through in lighter areas. Shading is done by pressing harder, not by mixing.

Transform the uploaded photo into this wax-crayon style. ${IDENTITY}${descriptionClause}

${FRAMING}

${NEGATIVES}`,
    },
    {
      label: "Ink Sketch",
      prompt: `Loose black-ink pen sketch with visible cross-hatching on cream paper — thin confident single-weight pen lines that vary only with speed, dense parallel hatching for shadows that build depth through line density alone. No colour fills — pure black ink on warm cream ground, with occasional areas left deliberately empty for contrast. The cross-hatching rotates direction between shadow zones. A few splattered ink dots where the pen paused.

Transform the uploaded photo into this ink pen sketch style. ${IDENTITY}${descriptionClause}

${FRAMING}

${NEGATIVES}`,
    },
    {
      label: "Watercolour",
      prompt: `Soft watercolour wash with visible cold-pressed paper grain and bleeding edges — pigment pools at stroke boundaries creating darker tide-lines, colours bleed softly into each other where wet areas meet, deliberate cauliflower blooms where excess water backflowed. Thin pencil under-sketch lines barely visible beneath the translucent washes. Palette is light and airy with generous unpainted white-paper areas serving as highlights.

Transform the uploaded photo into this watercolour style. ${IDENTITY}${descriptionClause}

${FRAMING}

${NEGATIVES}`,
    },
  ];
}
