/* DoodleBooth avatar constants, migrated from DoodleBooth (src/app/page.tsx).
   Framework-agnostic data + prompt strings shared by the client script and
   the SVG avatar builder. No DOM access here. */

export interface Theme {
  id: string;
  label: string;
  bg: string;
  accent: string;
  styleHint: string;
}

export interface AvatarAttrs {
  hairStyle: string;
  hairColor: string;
  skinTone: string;
  expression: string;
  mouth: string;
  accessories: string[];
  earringStyle: string;
}

export const THEMES: Theme[] = [
  {
    id: "pastel",
    label: "Pastel",
    bg: "#FCEFE3",
    accent: "#FF8FB1",
    styleHint:
      "Soft pastel palette (blush pink, buttery cream, sky blue), gentle watercolor blending, rounded friendly shapes, warm cream background, storybook-illustration warmth.",
  },
  {
    id: "neon",
    label: "Neon",
    bg: "#171423",
    accent: "#39FF88",
    styleHint:
      "Dark background with vivid neon marker outlines (electric green, hot magenta, cyan), high-contrast glow-line style like a blacklight poster, bold graphic energy, slightly punk/streetwear attitude.",
  },
  {
    id: "sunset",
    label: "Sunset",
    bg: "#2B1B3D",
    accent: "#FF6B4A",
    styleHint:
      "Warm sunset gradient palette (coral, tangerine, deep violet), dreamy dusk lighting, soft airbrushed color transitions behind the subject, romantic golden-hour mood.",
  },
  {
    id: "mono",
    label: "Mono",
    bg: "#F2F0EA",
    accent: "#20180F",
    styleHint:
      "Strict black ink on white/off-white background, no color at all, bold confident line-art like a screen-printed zine illustration, high contrast, minimal cross-hatching for shading only.",
  },
];

export const HAIR_COLORS = ["#FF6FA0", "#4FD1C5", "#7C7CE8", "#FFB54A", "#2E2E2E", "#E85D5D", "#37B24D"];
export const SKIN_TONES = ["#F6D2B0", "#EAB48A", "#C88A5E", "#8A5A3C", "#FBE3C6"];
export const HAIR_KEYS = ["curly-crop", "long-wavy", "spiky", "buzz-fade", "double-bun", "straight-bob"];
export const EXPR_KEYS = ["smile", "wink", "surprised", "smirk", "serious"];
export const MOUTH_KEYS = ["smile-open", "smile-closed", "smirk-mouth", "neutral", "surprised-o"];
export const ACC_POOL = ["earrings", "glasses", "nose-ring", "freckles", "headband"];
export const EARRING_STYLES = ["hoop", "stud", "dangle"];

export const LOADING_MESSAGES = [
  "Studying your features...",
  "Mixing marker colors...",
  "Sketching in rough brushwork...",
  "Adding the doodle magic...",
  "Crafting playful asymmetry...",
  "Finishing with naive charm...",
];

/* ---- 3x2 doodle-collage prompt builder ----
   Produces one image containing a 3-column x 2-row (six-panel) collage of
   the same subject in different poses/moments, with hand-drawn doodle
   overlays. Pools below are combined per-call so every generation is a
   fresh combination instead of one fixed hardcoded prompt. */

export function buildDoodlePrompt(styleHint: string): string {
  return `Transform the uploaded photo into one single hand-drawn illustrated doodle avatar. Preserve the person's recognizable hairstyle, face shape, expression, skin tone, clothing, and accessories, but translate everything into cute naive marker-and-ink cartoon artwork. Use bold clean outlines, simplified facial features, flat cheerful colors, playful slightly exaggerated proportions, and a clean white or warm-white background. Apply this visual theme: ${styleHint}. The result must be clearly illustrated doodle art, not a real photograph. No photorealism, no photographic skin texture, no realistic lighting, no 3D render, no heavy realistic shading, no text, no captions, no watermark, and no logo.`;
}

export const COLLAGE_POSE_SETS: string[][] = [
  ["a cheerful wink with hand on cheek", "laughing candidly with eyes closed", "playful peace sign near the face", "surprised open-mouth reaction", "cozy chin-on-hands daydream pose", "playfully covering half the face with both hands"],
  ["confident hands-on-hips stance", "over-the-shoulder glance back", "thoughtful hand under chin", "big open-arms excited pose", "quiet close-up half-smile", "candid laugh caught mid-motion"],
  ["holding up a small doodle heart shape", "tilted head with a soft smile", "hand playfully near an ear like listening to music", "cheerful thumbs up", "resting cheek on both palms", "looking slightly upward with a hopeful expression"],
  ["mid-laugh with head tipped back", "curious tilted-head close-up", "one eye winking with a smirk", "arms crossed with a confident grin", "gentle sleepy-eyed cozy pose", "excited hands near the face like a happy gasp"],
];

export const COLLAGE_DOODLE_THEMES: string[] = [
  "small hearts, sparkles, and gentle motion swirls",
  "musical notes, soft stars, and playful squiggles",
  "tiny flowers, dotted trails, and soft cloud shapes",
  "sparkle bursts, swirly motion lines, and small exclamation marks",
  "cute speech-bubble doodles, hearts, and light scribbled arrows",
];

export const COLLAGE_MOOD_TONES: string[] = [
  "bright, airy, high-key lighting with soft natural color and a fresh, cheerful energy",
  "warm sunlit tone with gentle golden highlights and a relaxed, candid feeling",
  "clean minimal studio light with soft pastel undertones and a calm, polished mood",
  "soft daylight through a window with a cozy, lighthearted, diary-like feeling",
];

export function buildCollagePrompt(): string {
  const poses = pick(COLLAGE_POSE_SETS);
  const doodleTheme = pick(COLLAGE_DOODLE_THEMES);
  const mood = pick(COLLAGE_MOOD_TONES);

  const panelLines = poses
    .map((pose, i) => `Panel ${i + 1} (row ${Math.floor(i / 3) + 1}, ${["left", "middle", "right"][i % 3]} column): ${pose}.`)
    .join(" ");

  return `Create a single wide landscape image laid out as a strict grid with EXACTLY 3 columns and EXACTLY 2 rows, for a total of 6 panels arranged in 2 rows of 3 panels each (NOT 2 columns, NOT 3 rows, NOT a portrait layout — the final image must be wider than it is tall). Do NOT keep this photographic or realistic. Every panel must be a hand-drawn illustrated doodle artwork — flat naive-doodle marker/ink style, bold clean outlines, simplified facial features, playful and slightly exaggerated proportions, like a cute hand-sketched cartoon avatar, NOT a real photograph. Each panel shows the SAME illustrated subject (matching the hairstyle, face shape, and outfit from the reference photo, translated into doodle art), in six different candid moments, each with a different pose, angle, and expression, but clearly the same drawn character throughout.

${panelLines}

Each panel should feel like a warm, hand-illustrated doodle sketch with a clean and airy background — flat colors, visible marker or ink linework, no photographic skin texture, no 3D shading, no realistic lighting. ${mood}, translated into the doodle-art palette.

Overlay extra white hand-drawn doodle lines across the entire collage on top of the illustrated panels: thin scribbled motion lines, small connecting squiggles between panels, and ${doodleTheme}, matching the action or feeling in each frame. These extra doodle lines should feel spontaneous and hand-sketched, like they were drawn directly on top of the artwork with a white marker or pen.

Separate the six panels with thin clean white borders/gutters arranged in a 3-wide by 2-tall grid (three panels across the top row and three panels across the bottom row) so each frame reads individually while the whole page feels like one cohesive, lively, fully-illustrated scrapbook or visual-diary doodle collage. No text, no captions, no watermarks, no logos, no photorealism anywhere in the image.`;
}

/* ---- Full-body action collage: same 3x2 landscape layout rules, but the
   subject is shown full-body performing different physical actions/poses per
   panel (dancing, walking, holding objects, expressive gestures), as opposed
   to the close-up face collage above. */

export const FULL_BODY_ACTION_SETS: string[][] = [
  ["strutting confidently with a shopping bag in each hand", "mid-twirl with arms out and hair in motion", "playful jump with both feet off the ground", "leaning against an invisible wall, casual pose", "candid laugh while looking over the shoulder", "arms up in a joyful victory pose"],
  ["walking mid-stride toward the camera", "sitting cross-legged with a relaxed smile", "playful karate kick pose, one leg raised", "hands on hips in a confident power stance", "twirling with a flowing outfit motion", "waving cheerfully with one arm raised"],
  ["dancing with one knee bent and arms swaying", "crouched down looking curiously at the camera", "running pose caught mid-motion", "sitting on the floor hugging their knees, cozy", "big stretch with both arms overhead", "playful hop with a big open-mouth smile"],
  ["holding a coffee cup while casually strolling", "spinning around with arms outstretched", "sitting sideways on a chair, relaxed and cool", "excited both-hands-up cheer pose", "candid mid-laugh with head tilted back, full body", "confident walk-away pose glancing back at the camera"],
];

export function buildFullBodyCollagePrompt(): string {
  const actions = pick(FULL_BODY_ACTION_SETS);
  const doodleTheme = pick(COLLAGE_DOODLE_THEMES);
  const mood = pick(COLLAGE_MOOD_TONES);

  const panelLines = actions
    .map((action, i) => `Panel ${i + 1} (row ${Math.floor(i / 3) + 1}, ${["left", "middle", "right"][i % 3]} column): full-body illustrated figure, ${action}.`)
    .join(" ");

  return `Create a single wide landscape image laid out as a strict grid with EXACTLY 3 columns and EXACTLY 2 rows, for a total of 6 panels arranged in 2 rows of 3 panels each (NOT 2 columns, NOT 3 rows, NOT a portrait layout — the final image must be wider than it is tall). Do NOT keep this photographic or realistic. Every panel must be a hand-drawn illustrated doodle artwork — flat naive-doodle marker/ink style, bold clean outlines, simplified features, playful and slightly exaggerated proportions, like a cute hand-sketched cartoon character, NOT a real photograph. Each panel shows the FULL BODY (head to feet clearly visible, not cropped to the face) of the SAME illustrated character (matching the hairstyle, face shape, and outfit from the reference photo, translated into doodle art), doing six different dynamic actions or poses, but clearly the same drawn character throughout.

${panelLines}

Each panel should feel like a warm, hand-illustrated doodle sketch with a clean and airy background with enough space to show the whole body — flat colors, visible marker or ink linework, no photographic skin texture, no 3D shading, no realistic lighting. ${mood}, translated into the doodle-art palette.

Overlay extra white hand-drawn doodle lines across the entire collage on top of the illustrated panels: thin scribbled motion lines that trace the movement of each pose, small connecting squiggles between panels, and ${doodleTheme}, matching the action in each frame. These extra doodle lines should feel spontaneous and hand-sketched, like they were drawn directly on top of the artwork with a white marker or pen.

Separate the six panels with thin clean white borders/gutters arranged in a 3-wide by 2-tall grid (three panels across the top row and three panels across the bottom row) so each frame reads individually while the whole page feels like one cohesive, lively, energetic, fully-illustrated action doodle collage. No text, no captions, no watermarks, no logos, no photorealism anywhere in the image.`;
}

export const SURPRISE_PROMPTS = [
  "A young woman with wild curly pink hair, round glasses, and a mischievous smirk. Wearing oversized hoop earrings and a denim jacket.",
  "A bearded man with a buzz cut, warm brown skin, wearing a beanie and a single gold stud earring. Friendly relaxed expression.",
  "A person with a sleek silver bob haircut, sharp eyeliner, and a tiny nose ring. Cool serious expression with dramatic cheekbones.",
  "A kid with messy spiky red hair, big surprised eyes, freckles everywhere, and a gap-toothed grin. Wearing a dinosaur hoodie.",
  "An elderly woman with elegant gray hair in a bun, kind smile lines, pearl earrings, and reading glasses on the tip of her nose.",
  "A young person with long wavy purple hair, headband with a bow, soft smile, wearing layered necklaces and a vintage band tee.",
];

/* Sample presets rendered as a decorative rail. */
export const SAMPLE_PRESETS: AvatarAttrs[] = [
  { hairStyle: "curly-crop", hairColor: "#FF6FA0", skinTone: "#F6D2B0", expression: "wink", mouth: "smile-closed", accessories: ["earrings"], earringStyle: "dangle" },
  { hairStyle: "spiky", hairColor: "#4FD1C5", skinTone: "#EAB48A", expression: "smirk", mouth: "smirk-mouth", accessories: ["headband"], earringStyle: "hoop" },
  { hairStyle: "double-bun", hairColor: "#2E2E2E", skinTone: "#C88A5E", expression: "surprised", mouth: "surprised-o", accessories: ["earrings"], earringStyle: "stud" },
  { hairStyle: "straight-bob", hairColor: "#7C7CE8", skinTone: "#FBE3C6", expression: "smile", mouth: "smile-open", accessories: ["glasses"], earringStyle: "hoop" },
  { hairStyle: "long-wavy", hairColor: "#FFB54A", skinTone: "#8A5A3C", expression: "smile", mouth: "smile-closed", accessories: ["freckles"], earringStyle: "hoop" },
];

export const STORAGE_KEY = "doodleme_api_key";
export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

export function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
