/* Skills catalog for the Home / Skills marketplace / Skill detail screens,
   the composer's "/" picker, and the sitemap.

   This is a view over the SKILL.md packages in src/mastra/skills/ — the same
   files the Mastra agent loads (see src/lib/skill-loader.ts). A skill is
   therefore added or edited in exactly one place: its own directory. Entries
   with `runnable: true` map 1:1 onto the generation modes in
   doodle-constants.ts (their `id` matches the mode string the generateDoodle
   tool and /api/agent use); the rest are roadmap previews, shown as disabled
   cards and never attached to the agent. */

import { buildAvatarSVG } from "./doodle-avatar";
import { SAMPLE_PRESETS } from "./doodle-constants";
import { SKILL_DEFINITIONS, type SkillCategory } from "./skill-loader";

export type { SkillCategory };

/* Neutral build-time thumbnail theme — same convention the old sample rail
   used, independent of the visual-style themes users pick in Settings. */
const THUMBNAIL_THEME = { id: "sample", label: "Sample", bg: "#FBF5E9", accent: "#FAB700", styleHint: "" };

export function buildSkillThumbnail(skill: Skill): string {
  const preset = SAMPLE_PRESETS[skill.sampleIndex % SAMPLE_PRESETS.length];
  return buildAvatarSVG(preset, THUMBNAIL_THEME);
}

export interface Skill {
  /** Generation-mode id, e.g. "normal" — also the /skills/[id] route param. */
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
  /** Index into SAMPLE_PRESETS (doodle-constants.ts), used only when thumbnailUrl is unset. */
  sampleIndex: number;
  /** A real generateDoodle output to show instead of the synthetic SVG preview, when set. */
  thumbnailUrl?: string;
  /** The agent-facing skill name (kebab-case), i.e. its SKILL.md directory. */
  packageName: string;
}

export const SKILLS: Skill[] = SKILL_DEFINITIONS.map((definition) => ({
  id: definition.id,
  name: definition.displayName,
  tagline: definition.tagline,
  desc: definition.desc,
  longDesc: definition.longDesc,
  category: definition.category,
  tags: definition.tags,
  runnable: definition.runnable,
  requiresPhoto: definition.requiresPhoto,
  aspectRatio: definition.aspectRatio,
  sampleIndex: definition.sampleIndex,
  thumbnailUrl: definition.thumbnailUrl,
  packageName: definition.name,
}));

export function getSkill(id: string): Skill | undefined {
  return SKILLS.find((s) => s.id === id);
}

export const SKILL_CATEGORIES: { id: SkillCategory | "for-you"; label: string }[] = [
  { id: "for-you", label: "For you" },
  { id: "avatars", label: "Avatars" },
  { id: "collages", label: "Collages" },
  { id: "freeform", label: "Freeform" },
];
