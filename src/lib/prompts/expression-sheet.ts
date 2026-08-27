/**
 * Expression Pack — multi-image prompt builder
 *
 * Produces 9 SEPARATE square images of the same person, each a different
 * expression/reaction, from one uploaded photo. Designed for messaging
 * sticker sets where each frame must be its own file.
 *
 * Character consistency strategy: a single LIKENESS ANCHOR clause is
 * repeated verbatim in every prompt — it locks hairstyle, hair colour,
 * face shape, skin tone, accessories, and outfit so the model cannot
 * drift between frames. Only expression, head tilt, hand gesture, and
 * small emotive marks vary.
 */

import type { PackVariant, PromptInput } from "./index";

// ---- Expression definitions ----

interface Expression {
  label: string;
  pose: string;
  emotiveMarks: string;
}

const EXPRESSIONS: Expression[] = [
  {
    label: "Happy",
    pose: "big open-mouth smile with eyes slightly squeezed, head tilted 5° right",
    emotiveMarks: "two small four-pointed sparkles floating beside the head",
  },
  {
    label: "Laughing",
    pose: "head tipped back, mouth wide open in a belly-laugh, one hand near the cheek",
    emotiveMarks: "three short curved motion lines near the open mouth, tiny tear drop at corner of one eye",
  },
  {
    label: "Love",
    pose: "both hands forming a small heart shape near the chin, soft closed-mouth smile with slightly upturned eyes",
    emotiveMarks: "two small floating hand-drawn hearts drifting above the hands",
  },
  {
    label: "Sad",
    pose: "downturned mouth, eyebrows angled upward in the middle, head tilted slightly down",
    emotiveMarks: "a single small hand-drawn teardrop near one eye, a tiny downward squiggle",
  },
  {
    label: "Angry",
    pose: "furrowed brows, tight frown, arms crossed, head tilted slightly forward",
    emotiveMarks: "a small hand-drawn vein-pop mark near the temple, two short steam puffs above the head",
  },
  {
    label: "Shocked",
    pose: "wide-open eyes, mouth in a round O shape, both hands raised palms-out beside the face",
    emotiveMarks: "three small exclamation lines radiating above the head, tiny sweat drop on one side",
  },
  {
    label: "Thinking",
    pose: "one hand tucked under the chin, eyes looking upward to one side, slight pursed lips",
    emotiveMarks: "a small hand-drawn thought bubble with three dots trailing from the head",
  },
  {
    label: "Sleepy",
    pose: "half-closed droopy eyes, head tilted onto one raised shoulder, mouth in a tiny yawn",
    emotiveMarks: "three small hand-drawn Zzz letters floating in descending size above the head",
  },
  {
    label: "Thumbs Up",
    pose: "confident closed-mouth grin, one hand raised giving a clear thumbs-up gesture at shoulder height",
    emotiveMarks: "a small four-pointed sparkle near the raised thumb, a short upward arrow mark",
  },
];

// ---- Likeness anchor (repeated in every prompt for consistency) ----

const LIKENESS_ANCHOR = `Keep the SAME character in every image of this set: same hairstyle and hair colour, same face shape and proportions, same skin tone, same glasses or earrings or accessories if present, same outfit and outfit colours. Vary ONLY the facial expression, slight head tilt, hand gesture, and small emotive accent marks described below. Correct shapes from the photo — never realistic rendering.`;

// ---- Framing clause (identical in all 9) ----

const FRAMING = `Single head-and-shoulders subject, centred in frame, plain warm-white background, clean even white die-cut sticker border tightly hugging the silhouette. Square 1:1 aspect ratio.`;

// ---- Negative constraints ----

const NEGATIVES = `No photorealism, no 3D rendering, no smooth gradient shading, no rendered individual hair strands, no vector-art or comic-book rendering, no watermarks, no text, no logos.`;

/**
 * Build 9 separate expression sticker prompts from one uploaded photo.
 */
export function buildExpressionSheet(input: PromptInput): PackVariant[] {
  return EXPRESSIONS.map((expr) => ({
    label: expr.label,
    prompt: buildSingleExpression(expr, input),
  }));
}

function buildSingleExpression(expr: Expression, input: PromptInput): string {
  const descriptionClause = input.description
    ? ` Additional context for outfit or props: ${input.description}.`
    : "";

  return `Naive marker-and-ink doodle sticker — bold clean hand-drawn outlines, flat cheerful colour fills, visible marker hatching for shading, playful slightly exaggerated proportions. ${LIKENESS_ANCHOR}

Expression: "${expr.label}" — ${expr.pose}. Emotive marks: ${expr.emotiveMarks}.

${FRAMING}

${input.themeHint}${descriptionClause}

${NEGATIVES}`;
}
