/**
 * Webtoon Caricature Pack — multi-image prompt builder
 *
 * Recipe: one uploaded photo → four SEPARATE square images of the same person
 * in a thick-line Korean-webtoon comic style, each a different panel beat,
 * with a hand-lettered speech bubble containing 1–4 words.
 *
 * ─── IP RISK CONSTRAINT ───────────────────────────────────────────────────
 * NEVER name a real artist, real webtoon/manhwa series, real studio, or any
 * living illustrator in any prompt. Describe the generic visual qualities
 * of the medium directly (thick uniform ink outlines, cel-shaded flat colour
 * with hard shadow edges, glossy highlight on hair, large expressive eyes,
 * slight blush gradient on cheeks, screentone/halftone dot texture). This
 * avoids likeness-of-style IP claims.
 * ──────────────────────────────────────────────────────────────────────────
 *
 * Character consistency: one identical LIKENESS ANCHOR clause is repeated
 * verbatim in every prompt, locking hairstyle, hair colour, face shape, skin
 * tone, eye colour, accessories, outfit, and outfit colours. Only the panel
 * framing, pose, expression, and bubble text vary.
 *
 * This is a pack skill: returns PackVariant[], one entry per image.
 * generate-doodle.ts runs one API call per variant in parallel; total cost
 * is 4 credits (one per image).
 */

import type { PackVariant, PromptInput } from "./index";

// ---- Medium preamble (front-loaded to anchor model away from photorealism) ----

const MEDIUM_PREAMBLE = `Thick-line webtoon comic illustration. Clean uniform ink outlines of consistent weight, flat cel-shaded colour with hard-edged shadows (no gradient blending), glossy anime-style highlight on the hair, large expressive eyes with detailed iris catchlights, slight soft blush gradient on cheeks, subtle screentone halftone dot texture on clothing shadows. Square panel with thin black panel border.`;

// ---- Shared negative constraints ----

const NEGATIVES = `ABSOLUTE CONSTRAINTS: No photorealism, no 3D render, no airbrushed or smooth gradient skin, no rendered individual hair strands, no semi-realistic portrait, no watermarks, no signature, no logos. The result must read as a drawn manhwa/webtoon comic panel, never a photograph or 3D model.`;

// ---- Shared likeness-anchor (repeated in every prompt for consistency) ----

const LIKENESS_ANCHOR = `Keep the SAME character across all four panels: same hairstyle and hair colour, same face shape and proportions, same skin tone, same eye colour and shape, same glasses or earrings or accessories if present, same outfit and outfit colours. Vary ONLY the panel framing, pose, facial expression, and speech bubble text. Correct shapes from the photo — never photorealistic rendering.`;

// ---- Speech bubble instruction ----

const BUBBLE_INSTRUCTION = `Include ONE hand-lettered speech bubble with thick rounded white fill and black outline. Text inside is SHORT (1–4 plain English words), rendered in a bold comic-lettering font style. Keep the text brief so it renders legibly at small sizes.`;

// ---- Panel beat definitions ----

interface PanelBeat {
  label: string;
  framing: string;
  pose: string;
  defaultBubbleText: string;
}

const PANEL_BEATS: PanelBeat[] = [
  {
    label: "Hero Shot",
    framing: "Dynamic three-quarter view, upper body visible from waist up, slight low-angle perspective giving a confident heroic feel",
    pose: "confident stance with one hand on hip or fist raised, determined bright expression with a slight smirk, wind-swept hair motion lines",
    defaultBubbleText: "Let's go!",
  },
  {
    label: "Reaction",
    framing: "Close medium shot from chest up, centred composition, subtle speed-line radial background behind the character",
    pose: "exaggerated wide eyes and open mouth in comedic surprise, both hands raised palms-forward beside face, small sweat drops and exclamation marks",
    defaultBubbleText: "No way!",
  },
  {
    label: "Close-Up",
    framing: "Extreme close-up face filling most of the panel, slight Dutch tilt (5° rotation), dramatic shadow on one side",
    pose: "intense focused gaze directly at viewer, slight narrowed eyes with detailed iris highlight, subtle knowing smile, one eyebrow slightly raised",
    defaultBubbleText: "Watch me.",
  },
  {
    label: "Action",
    framing: "Full upper body with dynamic diagonal composition, thick motion lines streaking from the edges toward the character, panel border slightly cracked at one corner for energy",
    pose: "mid-action leaning forward with one arm extended in a punch or reaching gesture, hair and clothing flowing with motion, energetic open-mouth grin",
    defaultBubbleText: "Take this!",
  },
];

/**
 * Build 4 separate webtoon-panel prompts from one uploaded photo.
 *
 * @returns Exactly 4 PackVariant objects: "Hero Shot", "Reaction", "Close-Up", "Action".
 */
export function buildWebtoonCaricature(input: PromptInput): PackVariant[] {
  return PANEL_BEATS.map((beat) => ({
    label: beat.label,
    prompt: buildSinglePanel(beat, input),
  }));
}

function buildSinglePanel(beat: PanelBeat, input: PromptInput): string {
  // Allow user description to override or extend bubble text
  const bubbleText = input.description
    ? `Speech bubble text: "${input.description.length <= 20 ? input.description : beat.defaultBubbleText}".`
    : `Speech bubble text: "${beat.defaultBubbleText}".`;

  const descriptionClause = input.description && input.description.length > 20
    ? ` Scene context: ${input.description}.`
    : "";

  return `${MEDIUM_PREAMBLE}

Transform the uploaded photo into a webtoon comic panel. ${LIKENESS_ANCHOR}

PANEL: "${beat.label}" — ${beat.framing}. ${beat.pose}.

${BUBBLE_INSTRUCTION} ${bubbleText}${descriptionClause}

${input.themeHint}

${NEGATIVES}`;
}
