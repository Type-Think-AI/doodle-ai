/**
 * Workers shim for `unicorn-magic`.
 *
 * WHY THIS EXISTS
 * `unicorn-magic@0.3.0` ships CONDITIONAL exports:
 *
 *   "exports": {
 *     "node":    { "import": "./node.js"    },   // has toPath, traversePathUp, …
 *     "default": { "import": "./default.js" }    // has NEITHER
 *   }
 *
 * `npm-run-path@6` does `import {toPath, traversePathUp} from 'unicorn-magic'`.
 * Under Node that resolves the `node` condition and works. Wrangler bundles for
 * **workerd**, so it resolves the `default` condition and gets `default.js`,
 * which exports neither name — producing the hard build failure:
 *
 *   ✘ No matching export in ".../unicorn-magic/default.js" for import "toPath"
 *   ✘ No matching export in ".../unicorn-magic/default.js" for import "traversePathUp"
 *
 * The import chain is `@mastra/core` → `execa` → `npm-run-path` → here. It comes
 * from Mastra's OPTIONAL workspace-skills feature, which spawns CLI processes —
 * something that cannot run on Workers and that this app never calls (the agent
 * only uses agent.stream()/generate()). `astro.config.mjs` already marks that
 * whole chain `ssr.external`, which is why `astro build` succeeds. Wrangler runs
 * its OWN esbuild pass over dist/_worker.js and does not inherit that list, so
 * the break only surfaces under `wrangler dev` / `wrangler deploy`.
 *
 * WIRING
 * `wrangler.json` maps `unicorn-magic` here via a TOP-LEVEL `alias`. Do not add a
 * copy inside `env.staging`: wrangler 4.88 rejects `alias` in an env block
 * ("Unexpected fields found in env.staging field: alias") and the top-level entry
 * is already inherited — proven by a clean `wrangler deploy --dry-run --env staging`.
 *
 * Aliasing to this shim satisfies the imports so the Worker bundles. The
 * functions are never invoked at runtime; if some future code path ever does
 * call one, it throws loudly rather than silently misbehaving — a spawned
 * subprocess is impossible on Workers, so failing fast is the honest outcome.
 */

const unavailable = (name) => () => {
  throw new Error(
    `unicorn-magic.${name}() is not available on Cloudflare Workers. ` +
      "This is a shim for @mastra/core's optional workspace-skills path " +
      "(execa → npm-run-path), which spawns CLI processes and cannot run here. " +
      "If you hit this, something is trying to shell out at runtime.",
  );
};

/** Used by npm-run-path to normalise a URL/string path. */
export const toPath = (urlOrPath) =>
  urlOrPath instanceof URL ? urlOrPath.pathname : String(urlOrPath ?? "");

/** Used by npm-run-path to walk parent directories. Yields nothing here. */
export function* traversePathUp() {
  /* no filesystem to walk on Workers */
}

export const rootDirectory = "/";
export const execFileSync = unavailable("execFileSync");

/** Present in the real `default.js` export surface; kept for parity. */
export const delay = ({ seconds = 0, milliseconds = 0 } = {}) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds || seconds * 1000));
