/* Which art families a skill belongs to — the mapping behind the style filter.
 *
 * WHY THIS IS A KEYWORD MAP AND NOT A FIELD. No SKILL.md declares a family, and
 * back-filling one across 33 packages would be a bigger change than the filter is
 * worth. So a skill claims a family when its own words earn it.
 *
 * WHY THE TERM LISTS ARE SHORT AND ODD-LOOKING. A first pass used loose mood words
 * — action, hero, power, tiny, crayon, nostalgia — and mislabelled a third of the
 * catalogue: "Full-Body Action Collage" is a doodle skill that happens to say
 * "dynamic action", "Crayon Self" is not 90s cel because it says crayon, and
 * "Childhood Me" is not retro because it says nostalgia. A filter chip that shows
 * the wrong skills is worse than no chip, so a term earns its place only when a
 * skill containing it really is in that family. Generic mood and medium words are
 * deliberately absent, which is why some families have exactly one term.
 *
 * This lives in lib/ rather than in a page because two surfaces filter by family
 * — the home skill rail and /skills — and two copies of this rule would drift.
 * NOTE: src/pages/skills/index.astro still holds its own copy from the wave it
 * was written in; folding it onto this module is a pending cleanup.
 */
import { DEFAULT_ART_FAMILY_ID } from "./art-families";
import type { Skill } from "./skills";

const FAMILY_KEYWORDS: Record<string, string[]> = {
  "shonen-action": ["shonen", "power-up", "speed lines", "impact frame"],
  "magical-girl": ["magical girl", "magical-girl"],
  chibi: ["chibi"],
  "slice-of-life": ["slice of life", "slice-of-life"],
  "retro-cel": ["retro", "90s", "nineties", "cel animation"],
  "ink-wash": ["ink wash", "ink-wash", "watercolor", "watercolour", "sumi"],
  "pirate-voyage": ["pirate", "voyage", "high seas"],
  "ninja-village": ["ninja", "stealth warrior"],
  "monster-tamer": ["monster tamer", "creature"],
  "gag-comic": ["gag comic", "gag-comic", "gadget"],
  "mecha-pilot": ["mecha", "giant robot", "mech pilot"],
  "neon-city": ["neon city", "neon-city", "cyberpunk"],
  "eerie-shadow": ["eerie shadow", "eerie-shadow", "supernatural horror", "shadow spirit"],
};

/** Families this skill can legitimately be filtered into. Never empty. */
export function familiesForSkill(skill: Skill): string[] {
  const haystack = [skill.name, skill.tagline, skill.desc, skill.packageName, ...skill.tags]
    .join(" ")
    .toLowerCase();
  const matched = Object.entries(FAMILY_KEYWORDS)
    .filter(([, keywords]) =>
      keywords.some((keyword) =>
        new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(haystack),
      ),
    )
    .map(([familyId]) => familyId);
  return matched.length > 0 ? matched : [DEFAULT_ART_FAMILY_ID];
}

/** How many skills sit in each family, for chip counts and honest empty states. */
export function familyCounts(skills: Skill[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const skill of skills) {
    for (const id of familiesForSkill(skill)) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}
