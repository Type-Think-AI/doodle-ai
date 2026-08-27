/**
 * Childhood Me — prompt builder (multi-image pack)
 *
 * Recipe: one uploaded ADULT photo → four SEPARATE square doodle images of the
 * same person de-aged to four childhood stages. Each image depicts the person
 * at a different age while preserving durable identity features (hair colour &
 * pattern, eye colour, skin tone, face shape, freckles/moles, glasses if
 * present). Only age-appropriate proportions, clothing, and minor features
 * change between variants.
 *
 * This is a pack skill: it returns PackVariant[], one entry per image.
 * generate-doodle.ts runs one API call per variant in parallel; total cost
 * is 4 credits (one per image).
 */

import type { PackVariant, PromptInput } from "./index";

// ---- Medium preamble (front-loaded to prevent realistic drift) ----

const MEDIUM = `Naive marker-and-ink doodle illustration. Bold clean hand-drawn outlines, flat cheerful colour fills with visible marker hatching for shading, warm-white ground. Playful slightly exaggerated proportions, simplified facial features — correct shapes, never realistic rendering.`;

// ---- Negative constraints (repeated in every prompt) ----

const NEGATIVES = `ABSOLUTE CONSTRAINTS: No photorealism, no 3D rendering, no smooth gradient shading, no rendered hair strands, no vector-art or comic-book rendering, no watermarks, no text.`;

// ---- Likeness anchor (verbatim in all 4 prompts for cross-image consistency) ----

const LIKENESS_ANCHOR = `IDENTITY LOCK — this child is the SAME PERSON as in the uploaded adult photo, de-aged: preserve hair colour and hair pattern (curly, wavy, or straight), eye colour, skin tone, face shape outline, any freckles or moles, and glasses if present in the original. These features must be recognisably consistent across all four age images. Adult-only attributes must NOT appear on the child: no facial hair, no makeup, no adult jewellery, no adult clothing styles. Correct shapes from the photo — never realistic rendering.`;

// ---- Framing (identical across all 4 for visual cohesion) ----

const FRAMING = `Single head-and-shoulders subject, centred in frame, plain warm-white background, square 1:1 aspect ratio.`;

// ---- Age variant definitions ----

interface AgeVariant {
  label: string;
  ageDescription: string;
  proportions: string;
  clothing: string;
}

const AGES: AgeVariant[] = [
  {
    label: "Age 3",
    ageDescription: "a toddler around 3 years old",
    proportions:
      "Very round chubby cheeks, disproportionately large head relative to body (head is nearly 1/3 of visible height), tiny button nose, wide-set eyes that appear very large in the face, baby-plump jawline, short stubby fingers if hands are visible.",
    clothing:
      "Simple toddler outfit: plain round-neck t-shirt or a onesie, soft elastic shorts or dungarees, tiny velcro shoes or bare feet.",
  },
  {
    label: "Age 6",
    ageDescription: "a child around 6 years old",
    proportions:
      "Round cheeks (slightly less chubby than toddler), head still large relative to body but more proportionate, one or two missing front baby teeth visible in a grin, slightly longer face than at 3, small chin, ears that look slightly prominent.",
    clothing:
      "Early-school-age outfit: simple graphic t-shirt with a small doodle motif, elastic-waist shorts or a skirt, light-up sneakers or mary janes.",
  },
  {
    label: "Age 10",
    ageDescription: "a child around 10 years old",
    proportions:
      "Face starting to lengthen, cheeks still round but less baby-fat, adult front teeth now present (slightly oversized for the face — a normal 10-year-old trait), head-to-body ratio approaching normal, more defined jawline emerging, limbs longer and thinner.",
    clothing:
      "Late-childhood outfit: hoodie or zip-up jacket, jeans or cargo shorts, chunky trainers, optional backpack strap visible on one shoulder.",
  },
  {
    label: "Teen",
    ageDescription: "a young teenager around 14 years old",
    proportions:
      "Face proportions nearing adult but still slightly softer — rounder jaw than the adult photo, narrower shoulders, slightly shorter overall build. Features recognisably the same person approaching adulthood but visibly younger and less defined.",
    clothing:
      "Early-teen outfit: oversized band t-shirt or plain crew-neck, straight-leg jeans, canvas sneakers, a simple wristband or hair tie on wrist.",
  },
];

/**
 * Build the generation prompts for the Childhood Me skill.
 *
 * Returns exactly 4 PackVariant objects (Age 3, Age 6, Age 10, Teen), each
 * with a complete standalone prompt for /v1/images/edit.
 */
export function buildChildhoodMe(input: PromptInput): PackVariant[] {
  return AGES.map((age) => ({
    label: age.label,
    prompt: buildSingleAge(age, input),
  }));
}

function buildSingleAge(age: AgeVariant, input: PromptInput): string {
  const descriptionClause = input.description
    ? ` Additional context for era or outfit: ${input.description}.`
    : "";

  return `${MEDIUM}

Transform the uploaded adult photo into a hand-drawn doodle of the same person as ${age.ageDescription}. ${LIKENESS_ANCHOR}

AGE-APPROPRIATE CHANGES:
${age.proportions}

CLOTHING:
${age.clothing}

${FRAMING}

${input.themeHint}${descriptionClause}

${NEGATIVES}`;
}
