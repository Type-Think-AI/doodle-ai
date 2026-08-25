import type { APIContext } from "astro";
import { readSecret, type SecretLike } from "./secrets";

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
 *
 * Async because a bridged value may be a Secrets Store binding rather than a
 * plain string (see src/lib/secrets.ts), and those are only readable with
 * `await binding.get()`. That asymmetry is the whole reason this function
 * has to exist rather than the call sites reading `env` directly: Mastra
 * needs a synchronous string on `process.env`, so the async read has to
 * happen *before* the agent is constructed. Every caller must therefore
 * `await` this before the `import("../../mastra")` that builds the agent —
 * bridging after that import is too late, and the agent falls back to its
 * default model or fails on a missing key.
 */
export async function bridgeCloudflareEnv(context: APIContext, keys: string[]): Promise<void> {
  const runtimeEnv = (context.locals as { runtime?: { env?: Record<string, SecretLike> } })?.runtime
    ?.env;
  if (!runtimeEnv) return;

  // Resolved concurrently: with Secrets Store bindings each key is a network
  // read, and these are independent of one another.
  const resolved = await Promise.all(
    keys.map(async (key) => [key, await readSecret(runtimeEnv[key], key)] as const),
  );

  for (const [key, value] of resolved) {
    // Existing `process.env` values win, matching the previous behaviour:
    // an explicitly-set value (a real Node env var under `astro dev`) is
    // never clobbered by a binding.
    if (!process.env[key] && value) process.env[key] = value;
  }
}
