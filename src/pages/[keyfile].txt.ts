import type { APIContext } from "astro";
import { readIndexNowKey, runtimeEnvFrom } from "../lib/seo/config";

export const prerender = false;

/**
 * GET /<key>.txt — the IndexNow ownership proof.
 *
 * IndexNow verifies that we control the host by fetching a text file named
 * after the key, containing the key, from the host root
 * (https://www.indexnow.org/documentation). It has to be at the root: the
 * protocol scopes a key file to its own directory, so a file at /seo/key.txt
 * could only authorise URLs under /seo/.
 *
 * Served dynamically instead of committed to public/ because the repo is going
 * open source, and a key in git is a key anyone can use to submit URLs for this
 * host. See src/lib/seo/config.ts for that argument in full.
 *
 * This is a dynamic route at the root, so it is worth being explicit about what
 * it does NOT shadow: Astro ranks static segments above dynamic ones, so
 * /llms.txt and /llms-full.txt keep their own routes. Any other *.txt request
 * lands here and gets a 404 unless the filename is exactly the current key.
 */
export async function GET(context: APIContext): Promise<Response> {
  const requested = context.params.keyfile ?? "";
  // `readIndexNowKey`, NOT `resolveIndexNowConfig`: serving the ownership proof
  // has nothing to do with whether this origin can push. Using the latter here
  // made /<key>.txt 404 on localhost, i.e. exactly where you go to check the
  // file serves before deploying.
  const resolved = await readIndexNowKey(runtimeEnvFrom(context));

  // A 404 for every failure case, deliberately. This endpoint must not confirm
  // that IndexNow is configured, reveal the key's length, or distinguish "no
  // key set" from "wrong filename" — the only caller with a legitimate interest
  // is a search engine that already knows the key.
  if ("unavailable" in resolved) {
    return new Response("Not found", { status: 404 });
  }
  if (!timingSafeEqual(requested, resolved.key)) {
    return new Response("Not found", { status: 404 });
  }

  return new Response(resolved.key, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      // Search engines re-fetch this on their own schedule, and the key only
      // changes when we rotate it. An hour keeps a rotation from taking a day
      // to take effect while still absorbing repeat verification fetches.
      "Cache-Control": "public, max-age=3600",
    },
  });
}

/**
 * Constant-time string comparison.
 *
 * Genuinely marginal here — an attacker would have to brute-force an 8–128
 * character key one HTTP request at a time — but a secret compared with `===`
 * is the kind of thing that gets copied into a place where it does matter, so
 * it is written correctly once.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
