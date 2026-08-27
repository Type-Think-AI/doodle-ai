/**
 * Chibi Mini-Me Overlay — prompt builder
 *
 * Recipe: keep the user's real photo as an untouched photographic base layer,
 * then overlay 3-5 tiny chibi cartoon miniatures of the same person plus
 * handwritten-marker annotations and doodle accents on top.
 *
 * Evidence (highest-engagement recipe in the research set):
 *   @Ciri_ai, 1 May 2026
 *   https://x.com/Ciri_ai/status/2050094437821513896
 *   3,516 likes · 651 reposts · 224k views · 2,372 bookmarks
 *   Corroborated by @Sairah_0 https://x.com/Sairah_0/status/2050167506204238103
 *   Chinese/Xiaohongshu name: Q版 (Q-version chibi overlay)
 */

import { pick, pickMany } from "../doodle-constants";

// ---- Chibi action pools (what the mini versions are doing) ----

export const CHIBI_ACTION_SETS: string[][] = [
  [
    "cheerfully pumping a tiny fist in the air",
    "perched on the subject's shoulder, legs dangling",
    "holding up a tiny handwritten sign that says 'me!'",
    "napping curled up in the bottom corner with tiny Zzzs above",
    "flexing small muscles with a proud grin",
  ],
  [
    "drinking from a tiny water bottle, mid-sip",
    "sitting cross-legged below the subject, waving up at them",
    "climbing the edge of the photo like a tiny adventurer",
    "giving a thumbs up from behind the subject's ear",
    "scribbling something with a tiny marker, tongue out in concentration",
  ],
  [
    "lying on stomach near the bottom, chin in hands, kicking feet",
    "balancing on the subject's head with arms out like a tightrope walker",
    "doing a tiny celebratory jump with both arms raised",
    "sitting on an invisible ledge near the corner, swinging legs",
    "blowing a small party horn with confetti dots around",
  ],
  [
    "stretching in a tiny morning-yawn pose",
    "peek-a-booing from behind the subject's shoulder",
    "carrying a comically oversized pencil like a lance",
    "hugging a tiny heart shape with closed eyes",
    "running in from the edge of the frame, arms trailing behind",
  ],
];

// ---- Handwritten caption pools ----

export const CAPTION_SETS: string[][] = [
  ["let's go!", "mood ↗", "that's me!"],
  ["same energy", "mini vibes", "smol but mighty"],
  ["main character", "plot twist →", "yes chef!"],
  ["no thoughts", "living my best", "iconic tbh"],
  ["big mood", "tiny me says hi", "noted ✓"],
];

// ---- Accent style pools ----

export const ACCENT_STYLES: string[] = [
  "small four-pointed sparkle bursts and tiny solid hearts",
  "short motion-line dashes and small star shapes",
  "tiny floating music notes and soft loop swirls",
  "dotted trails and miniature lightning bolts",
  "small flower buds and gentle spiral squiggles",
];

/**
 * Build the generation prompt for the Chibi Mini-Me overlay skill.
 *
 * CRITICAL: This skill keeps the photo photographic — the negative
 * constraints are inverted relative to other skills. The base image must NOT
 * be cartoonified; only the overlay elements are illustrated.
 */
export function buildMiniMePrompt(input: {
  themeHint: string;
  description?: string;
}): string {
  const actions = pickMany(pick(CHIBI_ACTION_SETS), 4);
  const captions = pickMany(pick(CAPTION_SETS), 2);
  const accents = pick(ACCENT_STYLES);

  const chibiLines = actions
    .map((action, i) => `Chibi ${i + 1}: ${action}.`)
    .join(" ");

  const captionLine = captions
    .map((c) => `"${c}"`)
    .join(" and ");

  const contextHint = input.description
    ? ` The photo context is: ${input.description}. Make the chibi actions and captions relate to that context where possible.`
    : "";

  return `You are overlaying hand-drawn doodle elements on top of a REAL PHOTOGRAPH. The photograph itself MUST remain completely photographic and untouched — do NOT cartoonify it, do NOT apply illustration filters to it, do NOT alter the subject's real face, skin texture, or lighting. The photo is the base layer; it stays real.${contextHint}

On top of that photographic base, draw these overlay elements in a bold-outline flat-colour naive chibi-doodle style (big head, tiny body, Q-version proportions):

CHIBI MINIATURES (draw 3–4 tiny cartoon versions of the SAME person from the photo — match their hair colour/style, outfit colour, glasses if present — each doing a different small action):
${chibiLines}

Place chibis in different zones around the subject (shoulder perch, lower corners, floating beside the head, opposite side) — never over the subject's face. Keep them small relative to the real subject (roughly 15–20% of frame height each).

HANDWRITTEN CAPTIONS: Draw 2 short marker-style captions (${captionLine}) with hand-drawn wobbly arrows pointing at relevant spots. Use thick, slightly uneven lettering that matches the chibi outlines — not a digital font.

DOODLE ACCENTS: Scatter ${accents} lightly near the chibis and caption endpoints. Keep density low — no more than 8–10 individual accent marks total.

Apply this visual theme to the overlay elements only: ${input.themeHint}.

ABSOLUTE CONSTRAINTS:
- The underlying photograph must remain photographic, unfiltered, and unretouched.
- The subject's real face and body are never distorted or cartoonified.
- Only the chibi miniatures, captions, arrows, and accents are illustrated.
- No watermarks, no logos, no branding.
- No large blocks of text — captions are 2–4 words max each.
- Do not obscure the subject's face with any overlay element.
- The final image is square (1:1 aspect ratio).`;
}
