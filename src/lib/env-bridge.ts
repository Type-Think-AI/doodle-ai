import type { APIContext } from "astro";

/**
 * Mastra's model gateways (e.g. the OpenRouter routing used by
 * src/mastra/agents/doodle-agent.ts) read secrets via plain `process.env`,
 * which is how they work on Node. Cloudflare Workers don't populate
 * `process.env` from `.dev.vars`/deployed secrets — those only ever land in
 * `context.locals.runtime.env` (the platform proxy binding). Without this,
 * OPENROUTER_API_KEY is invisible to Mastra even though it's genuinely
 * configured, on both `astro dev` and the deployed Worker.
 *
 * `nodejs_compat` (wrangler.json) makes `process.env` a real, writable
 * object in this runtime, so bridging one into the other here is enough —
 * call this once at the top of any route that invokes a Mastra agent whose
 * model needs an env-based key.
 */
export function bridgeCloudflareEnv(context: APIContext, keys: string[]): void {
  const runtimeEnv = (context.locals as { runtime?: { env?: Record<string, string | undefined> } })?.runtime?.env;
  if (!runtimeEnv) return;
  for (const key of keys) {
    if (!process.env[key] && runtimeEnv[key]) process.env[key] = runtimeEnv[key];
  }
}
