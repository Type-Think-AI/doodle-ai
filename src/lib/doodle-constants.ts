/* Doodle AI avatar constants, migrated from Doodle AI (src/app/page.tsx).
   Framework-agnostic data + prompt strings shared by the client script and
   the SVG avatar builder. No DOM access here. */

/* The generation modes generate-doodle.ts can actually execute. This is the
   contract between the skill packages (each src/mastra/skills/<name>/SKILL.md, whose
   `metadata.id` must be one of these) and the tool that runs them —
   src/lib/skill-loader.ts fails the build if the two ever drift apart. */
export const GENERATION_MODES = ["normal", "collage", "full-body", "surprise", "stickers", "mood-captions", "gift"] as const;
export type GenerationMode = (typeof GENERATION_MODES)[number];

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

export const STYLE_THEME_STORAGE_KEY = "doodleai-style-theme";
export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

export function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** `count` distinct random entries from `arr`, order shuffled. */
export function pickMany<T>(arr: T[], count: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, shuffled.length));
}

/* ---- Sticker sheet prompt builder ----
   Produces one image containing several individually die-cut doodle
   stickers of the same subject — distinct from doodle-collage's grid of
   panels: each sticker here is a standalone cutout with its own border and
   shadow, meant to read as a peel-off sticker sheet. */

export const STICKER_LAYOUTS: string[] = [
  "four stickers arranged in a loose 2x2 grid with generous white space between them",
  "five stickers scattered in a relaxed cluster, a couple slightly overlapping at the corners for a lived-in sticker-sheet feel",
  "four stickers arranged in a single loose row, each at a slightly different playful tilt angle",
];

export const STICKER_POSE_SETS: string[][] = [
  ["a cheerful open-palm wave", "a playful wink with a small smile", "a big open-mouth laugh", "a shy two-finger peace sign near the cheek"],
  ["a confident closed-mouth smile", "a surprised open-mouth gasp", "both hands framing the face, cozy", "an enthusiastic thumbs up"],
  ["blowing a small doodle kiss", "arms crossed with a playful smirk", "a sleepy half-closed-eye yawn", "both hands up in a cheer"],
];

export function buildStickerPrompt(): string {
  const layout = pick(STICKER_LAYOUTS);
  const poses = pick(STICKER_POSE_SETS);
  const stickerLines = poses.map((pose, i) => `Sticker ${i + 1}: ${pose}.`).join(" ");

  return `Create a single sticker sheet image containing ${poses.length} separate individual doodle stickers of the SAME illustrated subject (matching the hairstyle, face shape, skin tone, and outfit from the reference photo, translated into hand-drawn doodle art), each cropped to a head-and-shoulders bust. Do NOT keep this photographic or realistic — every sticker must be flat naive-doodle marker/ink style, bold clean outlines, simplified features, playful and slightly exaggerated proportions, like a cute hand-sketched cartoon character, NOT a real photograph.

Layout: ${layout}.

${stickerLines}

Each sticker must have its own clean, even-thickness white die-cut border tightly hugging its silhouette (like a real vinyl sticker cutout), a very subtle warm paper-grain texture visible on the sticker surface, and a soft, short drop shadow beneath it suggesting it is a physical peel-off sticker sitting on a flat surface. The sheet background behind the stickers is a plain clean warm-white or soft neutral surface — no props, no scenery, no other decoration competing with the stickers themselves. No text, no captions, no watermarks, no logos, no photorealism anywhere in the image.`;
}

/* ---- Viral mood-caption doodle prompt builder ----
   One 3x2 grid (same panel mechanics as doodle-collage), but every panel
   pairs a mood-matched pose with a short hand-lettered caption baked
   directly into the illustration — built for sharing as a reaction image
   or status update. The word pool is deliberately a plain data array so
   more words can be appended later without touching the prompt logic. */

export interface MoodCaptionEntry {
  word: string;
  mood: string;
}

export const VIRAL_MOOD_WORDS: MoodCaptionEntry[] = [
  { word: "Miss You", mood: "hugging a small hand-drawn heart to the chest, soft wistful smile" },
  { word: "Enough", mood: "one palm raised outward, calm and steady expression" },
  { word: "Healing", mood: "eyes closed, one hand resting gently over the heart, peaceful expression" },
  { word: "Overthinking", mood: "hand pressed to the temple, a small hand-drawn spiral swirling above the head" },
  { word: "Lonely", mood: "knees hugged to the chest, sitting small, a little distance in the eyes" },
  { word: "Lost", mood: "looking off to one side, shoulders slightly slumped, unsure expression" },
  { word: "Tired", mood: "half-closed sleepy eyes, holding a small hand-drawn coffee cup" },
  { word: "Hope", mood: "looking slightly upward, a small hand-drawn sparkle near the eyes" },
  { word: "Peace", mood: "soft closed-eye smile, relaxed shoulders, calm and still" },
  { word: "Sorry", mood: "hands clasped together in front, gentle apologetic half-smile" },
  { word: "Goodbye", mood: "one hand raised in a small wave, soft bittersweet expression" },
  { word: "Wait", mood: "one palm raised outward, glancing at a small hand-drawn wristwatch" },
  { word: "Maybe", mood: "head tilted, one eyebrow raised, a small shrug" },
  { word: "Almost", mood: "thumb and finger pinched close together in an 'almost there' gesture" },
  { word: "Still", mood: "standing calm and still, hands folded, steady even gaze" },
  { word: "Again", mood: "sleeves rolled up, a determined half-smile" },
  { word: "Never", mood: "arms crossed, firm and resolute expression" },
  { word: "Why?", mood: "palms open and raised, puzzled expression, a couple of small hand-drawn question marks nearby" },
];

export function buildMoodCaptionPrompt(entries: MoodCaptionEntry[]): string {
  const panelLines = entries
    .map(
      (entry, i) =>
        `Panel ${i + 1} (row ${Math.floor(i / 3) + 1}, ${["left", "middle", "right"][i % 3]} column): ${entry.mood}. A short hand-lettered caption reading "${entry.word}" is drawn boldly inside this panel in playful doodle typography — thick, slightly uneven marker-style letters that match the illustration's own linework, not a clean digital font.`,
    )
    .join(" ");

  return `Create a single wide landscape image laid out as a strict grid with EXACTLY 3 columns and EXACTLY 2 rows, for a total of ${entries.length} panels arranged in 2 rows of 3 panels each (NOT 2 columns, NOT 3 rows, NOT a portrait layout — the final image must be wider than it is tall). Do NOT keep this photographic or realistic. Every panel must be a hand-drawn illustrated doodle artwork — flat naive-doodle marker/ink style, bold clean outlines, simplified features, playful and slightly exaggerated proportions, like a cute hand-sketched cartoon avatar, NOT a real photograph. Each panel shows the SAME illustrated subject (matching the hairstyle, face shape, and outfit from the reference photo, translated into doodle art), in six different candid moods, each panel captioned with its own short hand-lettered word, but clearly the same drawn character throughout.

${panelLines}

Each panel should feel like a warm, hand-illustrated doodle sketch with a clean and airy background — flat colors, visible marker or ink linework, no photographic skin texture, no 3D shading, no realistic lighting. Keep every caption large enough to read clearly at a glance, positioned so it never overlaps the character's face.

Separate the ${entries.length} panels with thin clean white borders/gutters arranged in a 3-wide by 2-tall grid so each frame reads individually while the whole page feels like one cohesive set of shareable mood-caption doodles. No watermarks, no logos, no photorealism anywhere in the image. The only text anywhere in the image is the one short caption per panel described above.`;
}

/* ---- Gift/greeting doodle prompt builder ----
   One portrait doodle framed as a shareable greeting card: an occasion is
   detected from the optional user description (falling back to a warm,
   occasion-neutral default), which drives both the border embellishments
   and the hand-lettered message on the card. */

export interface GiftOccasion {
  label: string;
  embellishments: string;
  message: string;
}

const GIFT_OCCASION_RULES: { keywords: string[]; occasion: GiftOccasion }[] = [
  {
    keywords: ["birthday", "bday"],
    occasion: { label: "Birthday", embellishments: "small hand-drawn balloons, a confetti burst, and a lit birthday candle", message: "Happy Birthday" },
  },
  {
    keywords: ["thank"],
    occasion: { label: "Thank You", embellishments: "small hand-drawn flowers and soft looping ribbon swirls", message: "Thank You" },
  },
  {
    keywords: ["congrat"],
    occasion: { label: "Congrats", embellishments: "hand-drawn stars, ribbon streamers, and a small party popper", message: "Congrats!" },
  },
  {
    keywords: ["get well", "feel better", "sorry you"],
    occasion: { label: "Get Well", embellishments: "soft pastel hand-drawn flowers and a small heart", message: "Get Well Soon" },
  },
  {
    keywords: ["love", "anniversary", "valentine"],
    occasion: { label: "Love", embellishments: "small hand-drawn hearts and soft swirl accents", message: "With Love" },
  },
];

export const DEFAULT_GIFT_OCCASION: GiftOccasion = {
  label: "Thinking of You",
  embellishments: "small warm hand-drawn hearts, soft dotted trails, and a couple of gentle sparkles",
  message: "Thinking of You",
};

export function pickGiftOccasion(description?: string): GiftOccasion {
  const text = (description || "").toLowerCase();
  const match = GIFT_OCCASION_RULES.find((rule) => rule.keywords.some((keyword) => text.includes(keyword)));
  return match ? match.occasion : DEFAULT_GIFT_OCCASION;
}

export function buildGiftPrompt(description?: string): string {
  const occasion = pickGiftOccasion(description);

  return `Transform the uploaded photo into a single hand-drawn illustrated doodle portrait, framed inside a warm greeting-card composition. Preserve the person's recognizable hairstyle, face shape, expression, skin tone, and accessories, but translate everything into cute naive marker-and-ink cartoon artwork — bold clean outlines, simplified facial features, flat cheerful colors, playful slightly exaggerated proportions. The background is a warm, softly colored card background (not a plain white avatar background) that suits a greeting card.

Surround the portrait with ${occasion.embellishments}, hand-drawn directly around the frame like they were sketched onto the card by hand — never digital clip-art.

Include the hand-lettered message "${occasion.message}" in bold, friendly doodle typography near the bottom of the card, drawn in a style that matches the rest of the illustration — thick, slightly uneven marker-style letters, not a clean digital font.

The result must be clearly illustrated doodle art on a card layout, not a real photograph. No photorealism, no photographic skin texture, no realistic lighting, no 3D render, no heavy realistic shading, no extra text beyond the one message above, no watermark, and no logo.`;
}
