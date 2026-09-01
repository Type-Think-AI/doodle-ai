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
import { SKILL_DEFINITIONS, type SkillCategory, type SkillKind } from "./skill-loader";

export type { SkillCategory, SkillKind };

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
  /** 'image' or 'video' — the UI badges a video skill and warns it costs per second. */
  kind: SkillKind;
  requiresPhoto: boolean;
  /* Shape of the skill's OUTPUT, used for the catalogue tile. "9:16" belongs to
     the vertical clip skills only — the image submit contract
     (src/lib/media/submit-image.ts) stays 1:1|3:2 because PicX has no portrait
     still size, and a video skill never reaches that path. */
  aspectRatio: "1:1" | "3:2" | "9:16";
  /** Index into SAMPLE_PRESETS (doodle-constants.ts), used only when thumbnailUrl is unset. */
  sampleIndex: number;
  /** A real generateDoodle output to show instead of the synthetic SVG preview, when set. */
  thumbnailUrl?: string;
  /** The input photo `thumbnailUrl` was generated from, for a before/after pair. */
  sourceImageUrl?: string;
  /**
   * The model-facing "Use when the user..." line from the SKILL.md frontmatter.
   * Surfaced on the skill page because it is the most concrete statement of what
   * the skill is for — and it is unique, non-boilerplate text per skill.
   */
  description: string;
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
  kind: definition.kind,
  requiresPhoto: definition.requiresPhoto,
  aspectRatio: definition.aspectRatio,
  sampleIndex: definition.sampleIndex,
  thumbnailUrl: definition.thumbnailUrl,
  sourceImageUrl: definition.sourceImageUrl,
  description: definition.description,
  packageName: definition.name,
}));

export function getSkill(id: string): Skill | undefined {
  return SKILLS.find((s) => s.id === id);
}

/**
 * Sibling skills to link from a skill page, nearest-first: same category before
 * anything else, and runnable skills before roadmap previews so a click always
 * lands somewhere useful.
 *
 * Computed rather than authored, so adding skill N+1 links it into the existing
 * set without editing any of them — the same reason the editorial articles
 * compute their related-reading block from a `cluster` field.
 */
export function relatedSkills(skill: Skill, limit = 4): Skill[] {
  const rank = (candidate: Skill): number =>
    (candidate.category === skill.category ? 0 : 2) + (candidate.runnable ? 0 : 1);

  return SKILLS.filter((candidate) => candidate.id !== skill.id)
    .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name))
    .slice(0, limit);
}

/* Filter chips for the Skills marketplace. Hand-authored because each entry
   needs a display label, but every SkillCategory in skill-loader.ts MUST appear
   here — a category with skills and no chip is unreachable in the UI. */
export const SKILL_CATEGORIES: { id: SkillCategory | "for-you"; label: string }[] = [
  { id: "for-you", label: "For you" },
  { id: "avatars", label: "Avatars" },
  { id: "collages", label: "Collages" },
  { id: "packs", label: "Packs" },
  { id: "freeform", label: "Freeform" },
];
