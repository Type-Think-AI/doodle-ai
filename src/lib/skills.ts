/* Skills catalog for the Home / Skills marketplace / Skill detail screens.
   Real, runnable skills map 1:1 onto the generation modes that already
   exist in doodle-constants.ts (their `id` matches the DoodleMode strings
   /api/agent returns, so a recommendation can route straight to
   /create/[id]). The rest are disabled "coming soon" cards pulled from the
   project's own roadmap (see README.md "Product direction") — not
   fake-runnable, just previewed. */

import { buildAvatarSVG } from "./doodle-avatar";
import { SAMPLE_PRESETS } from "./doodle-constants";

/* Neutral build-time thumbnail theme — same convention the old sample rail
   used, independent of the visual-style themes users pick in Settings. */
const THUMBNAIL_THEME = { id: "sample", label: "Sample", bg: "#FBF5E9", accent: "#FAB700", styleHint: "" };

export function buildSkillThumbnail(skill: Skill): string {
  const preset = SAMPLE_PRESETS[skill.sampleIndex % SAMPLE_PRESETS.length];
  return buildAvatarSVG(preset, THUMBNAIL_THEME);
}

export type SkillCategory = "avatars" | "collages" | "freeform";

export interface Skill {
  id: string;
  name: string;
  tagline: string;
  desc: string;
  longDesc: string;
  category: SkillCategory;
  tags: string[];
  runnable: boolean;
  requiresPhoto: boolean;
  aspectRatio: "1:1" | "3:2";
  /** Index into SAMPLE_PRESETS (doodle-constants.ts), for a real preview thumbnail. */
  sampleIndex: number;
}

export const SKILLS: Skill[] = [
  {
    id: "normal",
    name: "Doodle Avatar",
    tagline: "One hand-drawn doodle avatar from your photo",
    desc: "Turns a portrait into a single naive doodle fashion-chibi avatar — bold outlines, flat cheerful color, clearly illustrated.",
    longDesc:
      "Preserves your recognizable hairstyle, face shape, expression, skin tone, and accessories, then redraws them in cute naive marker-and-ink cartoon style: bold clean outlines, simplified features, flat cheerful colors, and a clean warm-white background. No photorealism.",
    category: "avatars",
    tags: ["portrait", "avatar", "marker"],
    runnable: true,
    requiresPhoto: true,
    aspectRatio: "1:1",
    sampleIndex: 0,
  },
  {
    id: "collage",
    name: "Doodle Collage",
    tagline: "Six close-up doodle poses in one 3x2 grid",
    desc: "Turns a photo into a landscape 3-column by 2-row collage of the same illustrated subject in six different candid close-up moments.",
    longDesc:
      "Reads your photo once, then draws six different candid close-up poses and expressions of the same illustrated character across a 3x2 grid, with hand-drawn doodle overlays (motion lines, sparkles, squiggles) tying the panels together like a lively scrapbook page.",
    category: "collages",
    tags: ["collage", "six panel", "scrapbook"],
    runnable: true,
    requiresPhoto: true,
    aspectRatio: "3:2",
    sampleIndex: 1,
  },
  {
    id: "full-body",
    name: "Full-Body Action Collage",
    tagline: "Six full-body action poses in one 3x2 grid",
    desc: "Like Doodle Collage, but head-to-toe: six dynamic full-body poses (dancing, jumping, walking) of the same illustrated character.",
    longDesc:
      "Same 3x2 landscape grid as Doodle Collage, but every panel shows the full body performing a different dynamic action — dancing, jumping, walking, stretching — with motion-line doodle overlays that trace the movement across the page.",
    category: "collages",
    tags: ["full body", "action", "six panel"],
    runnable: true,
    requiresPhoto: true,
    aspectRatio: "3:2",
    sampleIndex: 2,
  },
  {
    id: "surprise",
    name: "Surprise Me",
    tagline: "No photo needed — a random fictional doodle character",
    desc: "Skips the photo entirely and generates a fully fictional doodle avatar from a random character description.",
    longDesc:
      "For when you don't have (or don't want to use) a photo. Picks a random fictional character description — hairstyle, expression, accessories — and draws it in the same naive doodle style as Doodle Avatar.",
    category: "freeform",
    tags: ["freeform", "no photo", "random"],
    runnable: true,
    requiresPhoto: false,
    aspectRatio: "1:1",
    sampleIndex: 3,
  },
  {
    id: "stickers",
    name: "Sticker Pack",
    tagline: "Die-cut sticker sheets from your doodles",
    desc: "Slices a doodle into a sheet of die-cut stickers with paper grain and a soft drop shadow.",
    longDesc:
      "On the roadmap: feed a photo or an existing doodle through a cut-out pass that finds clean silhouettes, then lays each one on a sticker sheet with paper grain, a white die-cut border, and a soft contact shadow.",
    category: "freeform",
    tags: ["stickers", "die cut", "roadmap"],
    runnable: false,
    requiresPhoto: true,
    aspectRatio: "1:1",
    sampleIndex: 4,
  },
  {
    id: "moods",
    name: "Emotional Modes",
    tagline: "Mood-driven doodle variations — cozy, chaotic, dreamy",
    desc: "Same avatar, redrawn through a chosen emotional lens instead of a fixed visual theme.",
    longDesc:
      "On the roadmap: instead of picking a fixed visual theme, describe a mood — cozy, chaotic, dreamy, moody — and the doodle avatar's linework, palette, and composition shift to match it.",
    category: "freeform",
    tags: ["mood", "style", "roadmap"],
    runnable: false,
    requiresPhoto: true,
    aspectRatio: "1:1",
    sampleIndex: 0,
  },
  {
    id: "seasonal",
    name: "Seasonal Pack",
    tagline: "Holiday and seasonal doodle collage themes",
    desc: "Doodle Collage with a seasonal theme baked into the props, palette, and overlay doodles.",
    longDesc:
      "On the roadmap: a themed variant of Doodle Collage for holidays and seasons — the overlay doodles, palette, and small props in each panel shift to match (snowflakes in winter, blossoms in spring, and so on).",
    category: "collages",
    tags: ["seasonal", "collage", "roadmap"],
    runnable: false,
    requiresPhoto: true,
    aspectRatio: "3:2",
    sampleIndex: 1,
  },
];

export function getSkill(id: string): Skill | undefined {
  return SKILLS.find((s) => s.id === id);
}

export const SKILL_CATEGORIES: { id: SkillCategory | "for-you"; label: string }[] = [
  { id: "for-you", label: "For you" },
  { id: "avatars", label: "Avatars" },
  { id: "collages", label: "Collages" },
  { id: "freeform", label: "Freeform" },
];
