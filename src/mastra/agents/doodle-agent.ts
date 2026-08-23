import { Agent } from "@mastra/core/agent";

/**
 * Starter DoodleBooth agent, integrated directly into the Astro/Cloudflare
 * project (not a separate deployment) per the official Mastra Astro guide:
 * https://mastra.ai/integrations/frameworks/astro
 *
 * No persistent storage is configured yet — this runs with Mastra's default
 * in-memory store, so thread/message history resets on every Worker restart.
 * Add a Cloudflare-compatible storage adapter (D1 or KV) before relying on
 * cross-request memory in production. See:
 * https://mastra.ai/integrations/deploy/cloudflare
 *
 * The intent (per user request) is to grow this into a "skills" system: one
 * agent, multiple selectable generation skills (collage, full-body action,
 * normal doodle, future modes), instead of hardcoding UI per feedback item.
 *
 * Model: routed through OpenRouter's gateway syntax (openrouter/<provider>/
 * <model>), reading OPENROUTER_API_KEY from env. Currently pinned to
 * "stealth/ox-alpha", a free-during-preview anonymous third-party model
 * (as of Aug 2026) — free access is not guaranteed to continue, so swap the
 * model string if it starts erroring or billing.
 */
export const doodleAgent = new Agent({
  id: "doodle-agent",
  name: "Doodle agent",
  instructions:
    "You help DoodleBooth users decide what doodle generation mode fits their request: " +
    "\"normal\" (a single normal doodle avatar), \"collage\" (a 3x2 close-up doodle collage " +
    "with six poses/expressions), or \"full-body\" (a 3x2 full-body action doodle collage). " +
    "Always pick exactly one mode and give a brief one-sentence reason.",
  model: "openrouter/stealth/ox-alpha",
});
