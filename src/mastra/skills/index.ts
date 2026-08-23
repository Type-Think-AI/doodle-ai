/* Turns the SKILL.md packages in this directory into Mastra skills.

   Each subdirectory here is a self-contained Agent Skills package
   (https://agentskills.io) — SKILL.md plus an optional references/ folder —
   and is the single place a skill is edited. src/lib/skill-loader.ts parses
   them at build time; this module adapts the runnable ones for the agent,
   and src/lib/skills.ts adapts all of them for the UI.

   Roadmap packages (metadata.runnable: false) are deliberately withheld
   from the agent so the model is never offered a skill that cannot run —
   they exist only as catalog entries in the UI. */

import { createSkill } from "@mastra/core/skills";
import { RUNNABLE_SKILL_DEFINITIONS } from "../../lib/skill-loader";

export const DOODLE_SKILLS = RUNNABLE_SKILL_DEFINITIONS.map((definition) =>
  createSkill({
    name: definition.name,
    description: definition.description,
    instructions: definition.instructions,
    references: definition.references,
    license: definition.license,
    "user-invocable": definition.userInvocable,
    // Carries the generateDoodle `skill` id (and the photo requirement) with
    // the skill itself, so the agent prompt can be generated from the same
    // source instead of hardcoding the mapping.
    metadata: {
      id: definition.id,
      displayName: definition.displayName,
      requiresPhoto: definition.requiresPhoto,
      aspectRatio: definition.aspectRatio,
    },
  }),
);
