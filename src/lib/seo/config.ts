/* Resolving the IndexNow key, from either a request or a cron isolate.
 *
 * The key lives in a secret rather than in the repo, which needs justifying
 * because the key is *served publicly* at /<key>.txt — search engines fetch it
 * to verify we own the host, so it is not confidential in the usual sense.
 *
 * It is a secret anyway for one reason: this repo is going open source (see
 * OPEN_SOURCE_PLAN.md). A committed key would let anyone submit arbitrary
 * doodleai.art URLs to every IndexNow participant under our identity, which is
 * a cheap way to get the host rate-limited (429) or flagged for spam. Public
 * and guessable are different properties, and only the second one matters here.
 *
 * The binding is OPTIONAL on purpose. Its absence is a healthy state — the
 * feature is simply off, and /admin/seo says so — which matters because adding
 * a `secrets_store_secrets` binding for a secret that does not exist yet fails
 * the deploy with error 10182 and blocks every later deploy of the Worker. So
 * the code tolerates the missing binding, and the binding is added to
 * wrangler.json only after the store entry exists. Same pattern as
 * ADMIN_BOOTSTRAP_EMAIL in src/lib/auth/admin-guard.ts.
 */
import type { APIContext } from "astro";
import { readSecret, type SecretLike } from "../secrets";
import { isValidIndexNowKey } from "./indexnow";
import { SITE_ORIGIN } from "./inventory";

type RuntimeEnv = Record<string, SecretLike>;

/** The Worker env, whether we were handed a request context or a cron env. */
export function runtimeEnvFrom(context: APIContext): RuntimeEnv | undefined {
  return (context.locals as { runtime?: { env?: RuntimeEnv } })?.runtime?.env;
}

export interface IndexNowConfig {
  key: string;
  /** Absolute URL of the key file, always at the host root. */
  keyLocation: string;
  /** Bare hostname, as the protocol's `host` field wants it. */
  host: string;
}

/**
 * The Bing Webmaster API key, used to READ index status.
 *
 * A different credential from INDEXNOW_KEY and not interchangeable with it: the
 * IndexNow key is an ownership proof for submitting URLs and is published at
 * /<key>.txt, while this one authorises API reads and must never be exposed.
 * Generated under Bing Webmaster Tools → Settings → API access.
 */
export async function readBingApiKey(
  env: RuntimeEnv | undefined,
): Promise<{ key: string } | { unavailable: string }> {
  if (!env) return { unavailable: "No Worker runtime env available." };
  const key = await readSecret(env.BING_WEBMASTER_API_KEY, "BING_WEBMASTER_API_KEY");
  if (!key) {
    return {
      unavailable:
        "BING_WEBMASTER_API_KEY is not set. Generate it in Bing Webmaster Tools → Settings → API access — it is a different key from INDEXNOW_KEY.",
    };
  }
  return { key };
}

/**
 * The key itself, with no opinion about what it will be used for.
 *
 * Separate from `resolveIndexNowConfig` because the two callers need different
 * questions answered, and conflating them was a real bug: the key-file route
 * only needs "is this the key?", while the submitter also needs "can a search
 * engine reach us?". When the origin check lived in the shared function,
 * /<key>.txt started 404ing on localhost — so the one page you would use to
 * confirm the file serves correctly could never serve it.
 *
 * Returns the reason rather than throwing or returning bare null, so /admin/seo
 * can distinguish "no secret set" from "secret set but malformed" — the second
 * produces an unexplained 403 from IndexNow and is worth naming before anyone
 * spends an afternoon on it.
 */
export async function readIndexNowKey(
  env: RuntimeEnv | undefined,
): Promise<{ key: string } | { unavailable: string }> {
  if (!env) {
    return { unavailable: "No Worker runtime env available." };
  }
  const key = await readSecret(env.INDEXNOW_KEY, "INDEXNOW_KEY");
  if (!key) {
    return {
      unavailable:
        "INDEXNOW_KEY is not set. Create the secret, then add its Secrets Store binding to wrangler.json.",
    };
  }
  if (!isValidIndexNowKey(key)) {
    return {
      unavailable:
        "INDEXNOW_KEY is set but is not a valid key: it must be 8–128 characters of a-z, A-Z, 0-9 or dashes.",
    };
  }
  return { key };
}

/**
 * Everything the submitter needs: a valid key AND an origin a search engine can
 * actually fetch. Anything missing comes back as a reason /admin/seo can print.
 */
export async function resolveIndexNowConfig(
  env: RuntimeEnv | undefined,
  origin: string = SITE_ORIGIN,
): Promise<{ config: IndexNowConfig } | { unavailable: string }> {
  const resolved = await readIndexNowKey(env);
  if ("unavailable" in resolved) return resolved;
  const { key } = resolved;
  const url = new URL(origin);
  // Checked BEFORE returning a config, so a local or private origin can never
  // reach the network. IndexNow validates ownership by fetching the key file
  // over the public internet and rejects URLs that do not belong to the host, so
  // submitting `http://localhost:4321/...` is a guaranteed 403/422 — and it
  // would be recorded as a real push failure against every tracked row. This
  // makes the page say "discovery only here", which is the truth, instead of
  // letting someone spend a round trip proving it.
  if (!isPubliclyReachable(url)) {
    return {
      unavailable: `${url.origin} is not reachable from the public internet, so IndexNow cannot verify the key file or accept these URLs. Discovery works here; pushing only works on a deployed origin.`,
    };
  }
  return {
    config: {
      key,
      // Root placement is not a preference. Under the protocol's option 2, a key
      // file at /foo/key.txt may only authorise URLs under /foo/, so a key file
      // anywhere but the root could not cover the whole site.
      keyLocation: new URL(`/${key}.txt`, url).href,
      host: url.hostname,
    },
  };
}

/**
 * Whether a search engine could actually fetch this origin.
 *
 * Deliberately strict about the scheme too: the key file must be served over
 * HTTPS for a participant to trust it, so an http:// origin is not pushable even
 * when its hostname is public.
 */
function isPubliclyReachable(url: URL): boolean {
  if (url.protocol !== "https:") return false;
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost")) return false;
  if (host === "127.0.0.1" || host === "[::1]" || host === "::1") return false;
  if (host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".test")) return false;
  // A bare IP literal has no domain a key file can be verified against.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return false;
  // Single-label hosts ("staging", a container name) are not public DNS.
  return host.includes(".");
}
