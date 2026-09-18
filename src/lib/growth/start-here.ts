/**
 * Featured "Start here" skills on the homepage.
 *
 * IDs are generation-mode ids from SKILL.md `metadata.id` (see src/lib/skill-loader.ts),
 * not package directory names. Order is the conversion ranking: cheapest first-win,
 * then couple / pet / festival — the live gallery buried these under Moves clips.
 */
export const START_HERE_SKILL_IDS = ["stickers", "couple", "pet", "festival"] as const;

export type StartHereSkillId = (typeof START_HERE_SKILL_IDS)[number];

/** Resolve the four Start-here skills from the catalog, keeping authored order. */
export function resolveStartHereSkills<T extends { id: string }>(
  skills: readonly T[],
): T[] {
  const byId = new Map(skills.map((skill) => [skill.id, skill]));
  const resolved: T[] = [];
  for (const id of START_HERE_SKILL_IDS) {
    const skill = byId.get(id);
    if (skill) resolved.push(skill);
  }
  return resolved;
}
