/**
 * Family Portrait prompt builder.
 *
 * Evidence for this skill:
 * - Etsy EditingStudio: 136.5k sales / 5.7k reviews on custom family cartoon
 *   portraits — the dominant seller in the "wallet lane" (people pay for
 *   family keepsakes year-round, not just holidays).
 * - DataForSEO: "family cartoon portrait" — 4,400 searches/month
 * - Fiverr top-sellers in family caricatures: 2k–5k reviews avg.
 *
 * Multi-person likeness is the hardest prompt engineering challenge here:
 * diffusion models collapse faces, merge hairstyles, and lose children or
 * pets. The prompt anchors left-to-right ordering, per-person features, and
 * an explicit "never add/remove/merge people" constraint.
 */

import type { PromptInput } from "./index";

export function buildFamilyPortrait(input: PromptInput): string {
  const descriptionClause = input.description
    ? ` Context from the user: ${input.description}.`
    : "";

  return `Naive marker-and-ink doodle illustration — bold clean hand-drawn outlines, flat cheerful colour, visible marker hatching, warm-white ground. This is hand-sketched cartoon art with correct shapes, never realistic rendering.

Transform the uploaded photo of a family group (2–6 people, possibly including children and pets) into ONE unified square doodle illustration — not a collage, not split panels, not multiple images.

CRITICAL — EVERY person visible in the source photo MUST appear in the illustration. Do NOT add, remove, merge, or duplicate anyone.

Per-person likeness anchoring (apply to EACH individual separately):
- Preserve their left-to-right position as it appears in the source photo — do NOT rearrange the group.
- Preserve relative heights exactly — children must remain visibly shorter, tall family members taller.
- Preserve apparent ages — a child must look like a child, a grandparent must look older.
- Preserve each person's own hair colour, hairstyle, and length.
- Preserve each person's face shape, skin tone, and distinguishing features.
- Preserve glasses, facial hair, hats, and accessories per person.
- Preserve each person's outfit colours and general clothing shape.

If pets are visible in the photo, include them in their correct position relative to the family members, maintaining breed, fur colour, and size.

Pose & composition:
- Reproduce the family's physical arrangement from the photo — who is holding whom, arm placements, lean directions.
- Use a warm natural family grouping: close together, relaxed, affectionate.
- Centre the group on a clean warm-white background with light hand-drawn sparkle or heart accents in negative space only.

${input.themeHint}${descriptionClause}

HARD NEGATIVES — do NOT do any of the following:
- No photorealism, no 3D rendering, no smooth gradient shading, no rendered hair strands.
- No vector-art or comic-book rendering style.
- No blending or averaging faces between family members.
- No swapping hairstyles, accessories, or clothing between people.
- No equalising heights or ages — each person keeps their distinct stature.
- No inventing poses — reproduce body contact as photographed.
- No watermarks, no text, no logos, no captions.`;
}
