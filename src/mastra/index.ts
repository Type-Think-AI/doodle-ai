import { Mastra } from "@mastra/core/mastra";
import { doodleAgent } from "./agents/doodle-agent";

/**
 * Mastra instance for DoodleBooth, integrated directly into this Astro
 * project rather than a separate deployment. Imported from Astro API routes
 * (see src/pages/api/agent.ts), following:
 * https://mastra.ai/integrations/frameworks/astro
 */
export const mastra = new Mastra({
  agents: { doodleAgent },
});
