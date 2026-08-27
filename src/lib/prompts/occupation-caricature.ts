/**
 * Occupation Caricature prompt builder.
 *
 * Evidence for this skill:
 * - Etsy CartoonPortrait: 47.1k sales / 10.4k reviews — occupation gigs named
 *   explicitly (surgeon, pilot, teacher, firefighter, nurse, engineer).
 * - Fiverr top caricature sellers offer "profession caricature" upsell tier.
 * - DataForSEO: "caricature from photo" — 6,600 searches/month
 *
 * The challenge: keeping the caricature FLATTERING while exaggerating just
 * enough to be playful. We explicitly constrain which features may be
 * exaggerated (hair volume, smile, glasses) and forbid body-size or ethnic
 * feature distortion.
 */

import type { PromptInput } from "./index";

export function buildOccupationCaricature(input: PromptInput): string {
  const occupationClause = input.description
    ? `Derive the subject's occupation from this description: "${input.description}". Dress the subject in correct profession-specific attire, add 2–3 recognisable tools or props for that job, and place them in a simplified setting that evokes their workplace (e.g. cockpit instruments for a pilot, operating theatre lights for a surgeon, chalkboard for a teacher, kitchen pass for a chef).`
    : `No occupation was specified. Place the subject in a neutral friendly desk/office setting with generic professional props (laptop, coffee mug, notepad). Do NOT guess an occupation.`;

  return `Bold clean hand-drawn outlines, flat cheerful colour, visible marker hatching, warm-white ground — naive marker-and-ink doodle style. Correct shapes, never realistic rendering.

Create a friendly, affectionate caricature from the uploaded photo. The caricature must stay clearly FLATTERING — playful and warm, never mocking, never mean-spirited.

EXAGGERATION RULES:
- Gently exaggerate at most ONE or TWO signature features: hair volume, smile width, glasses size, jawline sharpness, or a prominent accessory.
- The subject must remain IMMEDIATELY recognisable as the person in the photo.
- NEVER exaggerate or distort: body size/weight, nose size relative to ethnicity, lip size, skin shade, or any feature tied to ethnic identity.
- NEVER make the subject look foolish, ugly, or unkind.

LIKENESS ANCHORING:
- Preserve the subject's hairstyle, hair colour, and length exactly.
- Preserve face shape, skin tone, and distinguishing features (moles, freckles, scars).
- Preserve glasses, facial hair, piercings, and ear/neck accessories.
- Preserve eye colour and general expression mood from the photo.

OCCUPATION & SETTING:
${occupationClause}

Composition: the subject is centred and shown from roughly the waist up (or full-body if the occupation's props require it — e.g. a firefighter in full gear). Background is simplified and relevant to the profession, with 2–3 scattered doodle accents (sparkles, motion lines, or small icons related to the job) in negative space.

${input.themeHint}

HARD NEGATIVES — do NOT do any of the following:
- No photorealism, no 3D rendering, no smooth gradient shading, no rendered hair strands.
- No vector-art or comic-book rendering style.
- No body-size distortion, no ethnic-feature exaggeration.
- No mocking, grotesque, or unflattering caricature tropes.
- No watermarks, no text, no logos, no captions.`;
}
