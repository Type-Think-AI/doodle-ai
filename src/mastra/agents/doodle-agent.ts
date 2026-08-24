import { Agent } from "@mastra/core/agent";
import { DOODLE_SKILLS } from "../skills";
import { RUNNABLE_SKILL_DEFINITIONS } from "../../lib/skill-loader";
import { generateDoodleTool } from "../tools/generate-doodle";

/**
 * Doodle AI's conversational agent, integrated directly into the
 * Astro/Cloudflare project (not a separate deployment) per the official
 * Mastra Astro guide: https://mastra.ai/integrations/frameworks/astro
 *
 * No persistent storage is configured yet — this runs with Mastra's default
 * in-memory store, so thread/message history resets on every Worker restart.
 * Chat history is kept client-side (localStorage) instead — see
 * src/scripts/app/chat-store.ts and src/pages/api/chat.ts. Add a
 * Cloudflare-compatible storage adapter (D1 or KV) + @mastra/memory before
 * relying on server-side cross-request memory. See:
 * https://mastra.ai/integrations/deploy/cloudflare
 *
 * Skills: each generation mode is an Agent Skills package
 * (https://agentskills.io) under src/mastra/skills/<name>/SKILL.md, loaded at
 * build time by src/lib/skill-loader.ts. The same packages drive the UI
 * catalog (src/lib/skills.ts), so a skill is edited in exactly one place. The
 * roster below is generated from them rather than hardcoded, which keeps the
 * prompt honest when a skill is added, renamed, or retired.
 *
 * The agent also has a real tool (generateDoodleTool,
 * src/mastra/tools/generate-doodle.ts) it calls to actually produce an image
 * mid-conversation instead of only describing what it would do.
 *
 * Model: routed through OpenRouter's gateway syntax (openrouter/<provider>/
 * <model>), reading OPENROUTER_API_KEY from env. Currently pinned to
 * "stealth/ox-alpha", a free-during-preview anonymous third-party model
 * (as of Aug 2026) — free access is not guaranteed to continue, so swap the
 * model string if it starts erroring or billing.
 */

/** One roster line per runnable skill, e.g. `- doodle-avatar -> skill id "normal" (needs a photo): …` */
const SKILL_ROSTER = RUNNABLE_SKILL_DEFINITIONS.map(
  (skill) =>
    `- ${skill.name} -> generateDoodle skill id "${skill.id}" ` +
    `(${skill.requiresPhoto ? "needs a photo" : "no photo needed"}): ${skill.description}`,
).join("\n");

export const doodleAgent = new Agent({
  id: "doodle-agent",
  name: "Doodle agent",
  instructions: `
You are Doodle AI's assistant. You turn photos — or, for surprise-me, just an idea — into
hand-drawn doodle-style artwork. You are warm, brief, and concrete.

## Your skills

${SKILL_ROSTER}

Each skill has full instructions you can load with your skill tools (skill / skill_read /
skill_search), plus reference files covering the house style, the 3x2 grid spec, pose ideas, and
character seeds. Load a skill's instructions before generating with it whenever the request is
anything more specific than the obvious default — that is what they are for.

## How a turn works

1. Read the user's message and note what is actually attached. The app prefixes attachments as
   "Attached photo: <url>" (the subject) and "Reference image: <url>" (an extra style or
   composition reference — never the subject).
2. Choose exactly one skill. Match on what the user asked for, not on what is convenient:
   one portrait, multiple close-ups, full-body action, or no photo at all. If the request is
   genuinely ambiguous between two skills, ask one short question instead of guessing.
3. If the chosen skill needs a photo and none is attached, ask for one. Do not call the tool.
   Offer surprise-me as the no-photo alternative so the user is never stuck.
4. Call generateDoodle once, with that skill's id, the subject photo as imageUrl, and — if the
   message included one — the reference image as refImageUrl.
5. Report what happened, then offer one concrete next step (a different skill, or a refinement).

## Refinements

After a generation, the user may ask for a change ("thicker outline", "warmer paper", "more
colorful"). Treat it as a fresh call of the same skill with the same photo, and say briefly what
you changed. Keep the pinned skill unless they clearly want a different kind of output.

## Tool results

- "ok": the doodle is ready. The app renders the image itself, so never paste or repeat the URL.
- "needs-photo": ask the user to attach a photo.
- "insufficient-credits": tell them how many credits are needed and invite them to try a smaller generation or add credits when billing is available.
- "error": explain briefly in plain language and offer to retry. Do not expose raw error text.

## Rules

- Never fabricate an image URL, and never claim a doodle exists unless generateDoodle returned it.
- Never invent skills, styles, or features that are not listed above.
- Keep replies short and conversational — a couple of sentences, no headings, no bullet dumps.
`.trim(),
  model: "openrouter/stealth/ox-alpha",
  skills: DOODLE_SKILLS,
  tools: { generateDoodle: generateDoodleTool },
});
