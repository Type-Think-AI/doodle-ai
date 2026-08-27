/**
 * Couple Doodle prompt builder.
 *
 * Evidence for this skill:
 * - X post @_you_like_TOP (4,962 likes, 687 reposts, 97k views) — man proposes
 *   using an AI couple cartoon: https://x.com/_you_like_TOP/status/2031579196934467811
 * - @MissDelulu9 (109 likes) requesting kawaii chibi couple transform:
 *   https://x.com/MissDelulu9/status/2070005638802112879
 * - Fiverr sweet_christine: 3,942 reviews at 4.8★ on couple caricatures
 * - Etsy BananaRoseArt: 19.7k sales on cartoon couple/family work
 * - DataForSEO: 'couple cartoon' — 9,900 searches/month, competition index 3
 *
 * The hard part is two-subject likeness: models blend faces, swap hairstyles,
 * and flatten height differences. The prompt anchors each person separately
 * before describing them together. See references/two-subject-likeness.md.
 */

export interface CoupleOccasion {
  label: string;
  embellishments: string;
}

const COUPLE_OCCASION_RULES: { keywords: string[]; occasion: CoupleOccasion }[] = [
  {
    keywords: ["anniversary"],
    occasion: {
      label: "Anniversary",
      embellishments:
        "small hand-drawn hearts of varying sizes, soft swirl accents, and a warm golden sparkle or two",
    },
  },
  {
    keywords: ["engag", "proposal", "propose"],
    occasion: {
      label: "Engagement",
      embellishments:
        "a small doodle ring with a sparkle, scattered confetti dots, and tiny hand-drawn stars",
    },
  },
  {
    keywords: ["wedding", "married", "wed"],
    occasion: {
      label: "Wedding",
      embellishments:
        "a minimal hand-drawn floral arch framing the top, small scattered petals, and soft ribbon swirls",
    },
  },
  {
    keywords: ["valentine", "love"],
    occasion: {
      label: "Valentine's",
      embellishments:
        "hand-drawn hearts of varying sizes in soft pink and red tones, gentle swirl accents",
    },
  },
  {
    keywords: ["just us", "just-us", "us together", "everyday"],
    occasion: {
      label: "Just Us",
      embellishments:
        "a few small hand-drawn sparkles and a soft warm glow around the couple — minimal, warm, understated",
    },
  },
];

const DEFAULT_COUPLE_OCCASION: CoupleOccasion = {
  label: "Together",
  embellishments:
    "a few small hand-drawn sparkles and soft dotted trails in the negative space — subtle and warm, not busy",
};

export function pickCoupleOccasion(description?: string): CoupleOccasion {
  const text = (description || "").toLowerCase();
  const match = COUPLE_OCCASION_RULES.find((rule) =>
    rule.keywords.some((keyword) => text.includes(keyword)),
  );
  return match ? match.occasion : DEFAULT_COUPLE_OCCASION;
}

export function buildCouplePrompt(description?: string): string {
  const occasion = pickCoupleOccasion(description);

  return `Transform the uploaded photo of two people into a single hand-drawn illustrated couple portrait. This is ONE unified square illustration — not a collage, not a split panel, not two separate images side by side.

CRITICAL — treat each person as a separately-anchored subject and preserve their individual likeness:

Person on the left (as they appear in the source photo):
- Preserve their exact hair colour, style, and length.
- Preserve their face shape, skin tone, and distinguishing features.
- Preserve glasses, facial hair, piercings, and accessories that belong to THIS person only.

Person on the right (as they appear in the source photo):
- Preserve their exact hair colour, style, and length.
- Preserve their face shape, skin tone, and distinguishing features.
- Preserve glasses, facial hair, piercings, and accessories that belong to THIS person only.

Together:
- Maintain the exact left-right positions as they appear in the source photo — do NOT mirror or swap them.
- Preserve the visible height difference between the two people.
- Reproduce their physical relationship EXACTLY as photographed — how they touch, lean, hold hands, embrace. Do NOT invent a generic pose.
- Each person must remain visually distinct. They should look like two unique individuals, not two versions of the same character.

HARD NEGATIVES — do NOT do any of the following:
- Do NOT blend or average their facial features toward a shared look.
- Do NOT swap hair styles, hair colours, or accessories between the two people.
- Do NOT make them look like siblings, twins, or the same person drawn twice.
- Do NOT equalize their heights — keep the height difference from the photo.
- Do NOT invent a pose — reproduce their body contact exactly as photographed.
- Do NOT add text, captions, names, watermarks, or logos.
- Do NOT produce photorealism, photographic skin texture, realistic lighting, 3D rendering, or heavy realistic shading.

Style: cute naive marker-and-ink cartoon artwork — bold clean outlines, simplified facial features, flat cheerful colors, playful slightly exaggerated proportions. The background is a clean white or warm-white.

Surround the couple with ${occasion.embellishments}, drawn in the same hand-sketched marker style — never digital clip-art, never overlapping either person's face. Keep embellishments in the negative space and border area.

The result must be clearly illustrated doodle art, not a photograph.`;
}
