import { readSecret, type SecretLike } from "./secrets";

/**
 * Resolve the tldraw canvas licence key from the Worker environment.
 *
 * WHY THIS IS A RUNTIME VALUE AND NOT A BUILD-TIME ONE
 * It used to be `PUBLIC_TLDRAW_LICENSE_KEY`, read through `import.meta.env` in
 * the canvas components. That makes it a BUILD-time value: Vite pastes the
 * literal key into the browser chunk, so the key has to exist on whichever
 * machine ran `astro build`. It lived in `.env`, which is gitignored (correctly —
 * this is a public repo), so Cloudflare Workers Builds never saw it and every
 * git-triggered release shipped `licenseKey: undefined`. tldraw skips its licence
 * check on `http://localhost`, so the bundle looked perfect in development and
 * then, on https://doodleai.art, tldraw waited five seconds after mount and
 * replaced the whole editor subtree with a hidden "licence expired" div. No
 * exception, no failed deploy, no log line — just a black void. It shipped that
 * way for two days before anyone connected the two facts.
 *
 * Reading it from the Worker environment instead removes the entire failure
 * class, because nothing depends on who ran the build any more. A laptop deploy,
 * a Workers Build and a fresh clone all behave identically.
 *
 * IT IS NOT ACTUALLY A SECRET
 * tldraw validates the key in the browser, so it must reach every visitor; it
 * travels in the page HTML as an island prop rather than inside a JS chunk.
 * That is the same exposure as before, not a new one. It lives in Secrets Store
 * regardless, for two reasons that have nothing to do with confidentiality:
 * it must stay out of a public repo, and Cloudflare validates
 * `secrets_store_secrets` bindings at DEPLOY time. A missing key is now a failed
 * deploy — a far stronger guarantee than any check this repo could run itself,
 * and the reason the build-time guard that briefly existed here was deleted.
 *
 * The one hazard left: this needs a page that renders on request. Every page
 * mounting a canvas is `prerender = false` today. If one is ever flipped to
 * prerendered there is no Worker environment at build time, the key resolves to
 * undefined and the canvas silently blanks again — which is why absence is
 * logged loudly below rather than passed through as a quiet `undefined`.
 */

/** Shape of the env object the Cloudflare adapter puts on `Astro.locals`. */
interface RuntimeLocals {
  runtime?: { env?: Record<string, SecretLike> };
}

const BINDING = "TLDRAW_LICENSE_KEY";

export async function resolveTldrawLicenseKey(locals: unknown): Promise<string | undefined> {
  const env = (locals as RuntimeLocals)?.runtime?.env;

  // Accepts both shapes readSecret knows about: the Secrets Store binding used
  // on the deployed Workers, and the plain string `.dev.vars` supplies locally
  // (Secrets Store bindings created with --remote are not readable in local dev).
  const key = await readSecret(env?.[BINDING], BINDING);
  if (key) return key;

  // Deliberately not silent. A missing key does not throw and does not break the
  // page — it degrades a canvas that will look fine for five seconds and then
  // vanish, which is close to undebuggable from the outside. Say so here.
  console.warn(
    `${BINDING} did not resolve, so the tldraw canvas will render unlicensed and ` +
      `blank itself shortly after mounting on any non-localhost origin. Check the ` +
      `Secrets Store binding on this Worker, that the secret still exists in the ` +
      `store, that this page is still \`prerender = false\`, and that .dev.vars ` +
      `defines ${BINDING} for local development.`,
  );
  return undefined;
}
