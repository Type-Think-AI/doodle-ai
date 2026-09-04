/* IndexNow client — https://www.indexnow.org/documentation
 *
 * IndexNow is a push protocol: you tell one participating search engine that a
 * URL was added, updated, or deleted, and that engine is required by the
 * protocol to share it with every other participant within ten seconds. So one
 * POST to api.indexnow.org reaches Bing, Yandex, Seznam, Naver, Yep, the
 * Internet Archive and Amazonbot — the full list is authoritative at
 * https://www.indexnow.org/searchengines.json.
 *
 * GOOGLE IS NOT ON THAT LIST, and nothing here reaches Google. Google has no
 * general URL-submission API at all: its Indexing API is restricted to pages
 * carrying JobPosting or BroadcastEvent markup
 * (https://developers.google.com/search/apis/indexing-api/v3/quickstart), which
 * Doodle AI has none of. Google discovery stays sitemap + internal links. If
 * you find yourself adding a "submit to Google" button, this is the comment
 * that explains why it cannot exist.
 */

/** Neutral endpoint that fans out to every participant. */
const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";

/** Protocol maximum per POST. Our corpus is ~145 URLs, so this never binds. */
export const INDEXNOW_MAX_BATCH = 10_000;

export interface IndexNowResult {
  ok: boolean;
  statusCode: number | null;
  /** Human-readable reason, present only on failure. */
  error?: string;
  /** How many URLs this call covered. */
  count: number;
}

/**
 * Response codes, from the protocol's own table. Worth encoding rather than
 * treating every non-200 as "retry later", because three of these are
 * permanent misconfigurations that retrying cannot fix:
 *
 *   200 OK        submitted
 *   202 Accepted  received, key validation pending — a SUCCESS, not a maybe
 *   400           malformed request
 *   403           key invalid (file missing, or file present without the key)
 *   422           URL does not belong to the host, or key fails the schema
 *   429           too many requests (treated as spam)
 */
function describe(status: number): string | undefined {
  switch (status) {
    case 200:
    case 202:
      return undefined;
    case 400:
      return "IndexNow rejected the request as malformed (400).";
    case 403:
      return "IndexNow could not validate the key file (403). Confirm /<key>.txt serves the key.";
    case 422:
      return "IndexNow rejected the URLs as not belonging to this host, or the key failed the schema (422).";
    case 429:
      return "IndexNow is rate-limiting us (429). Back off before retrying.";
    default:
      return `IndexNow returned an unexpected ${status}.`;
  }
}

/**
 * Push a batch of absolute URLs.
 *
 * Returns ONE result for the whole batch, because that is all the protocol
 * gives us: the response is a single status code with no body and no per-URL
 * breakdown. Callers that need per-URL rows must fan this result out and should
 * be honest in the schema that they are doing so — see the note in
 * `recordSubmissions()`.
 */
export async function submitToIndexNow(
  urls: string[],
  options: { host: string; key: string; keyLocation: string },
): Promise<IndexNowResult> {
  if (urls.length === 0) {
    return { ok: true, statusCode: null, count: 0 };
  }
  if (urls.length > INDEXNOW_MAX_BATCH) {
    return {
      ok: false,
      statusCode: null,
      error: `Refusing to submit ${urls.length} URLs; the protocol maximum is ${INDEXNOW_MAX_BATCH} per request.`,
      count: urls.length,
    };
  }

  let response: Response;
  try {
    response = await fetch(INDEXNOW_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        host: options.host,
        key: options.key,
        keyLocation: options.keyLocation,
        urlList: urls,
      }),
    });
  } catch (cause) {
    // A network failure is not a protocol failure, and must not be recorded as
    // one: there is no status code to reason about, so callers see null and can
    // safely retry on the next tick.
    return {
      ok: false,
      statusCode: null,
      error: `Could not reach IndexNow: ${cause instanceof Error ? cause.message : String(cause)}`,
      count: urls.length,
    };
  }

  const error = describe(response.status);
  return { ok: error === undefined, statusCode: response.status, error, count: urls.length };
}

/**
 * Validate a candidate key against the protocol's rules: 8–128 characters,
 * only a-z, A-Z, 0-9 and dashes.
 *
 * Checked before every submission rather than only at setup, because a key
 * that fails this comes back as a 403/422 with no explanation of which of the
 * two problems it was, and debugging that from a status code is miserable.
 */
export function isValidIndexNowKey(key: string): boolean {
  return /^[a-zA-Z0-9-]{8,128}$/.test(key);
}
