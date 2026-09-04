/* Walking Bing's index tree for the whole site in one pass.
 *
 * `GetChildrenUrlInfo` returns ONE level of children per call, paged, and marks
 * directory nodes with `isPage: false` + a child count. So reading the whole site
 * is a bounded breadth-first walk rather than 149 single-URL lookups.
 *
 * THE DECISION THAT MATTERS HERE is what absence means. A tracked URL missing
 * from the sweep could mean Bing does not have it — or that we ran out of call
 * budget, or hit an error partway, or never recursed into the directory holding
 * it. Reporting all three as "not indexed" would paint red across pages that are
 * indexed fine, which is the same class of mistake as inventing a verdict.
 *
 * So the sweep reports `complete` and callers may only infer absence from a
 * complete one. `complete` requires ALL of: zero request failures, every queued
 * directory actually visited, the budget not exhausted, and at least one entry
 * returned. Anything less and absence means "unknown", not "not indexed".
 */
import { fetchChildren, fetchUrlInfo, MAX_PAGES_PER_DIR, type BingUrlInfo } from "./bing";

/** Ceiling on API calls per sweep, so a pathological tree cannot spin forever. */
const DEFAULT_MAX_CALLS = 120;

/** How deep to recurse. Our deepest tracked path is two segments. */
const MAX_DEPTH = 4;

export interface BingSweep {
  /** Tracked path (leading and trailing slash) -> what Bing said about it. */
  byPath: Map<string, BingUrlInfo>;
  /** True only when absence from `byPath` is trustworthy. See the file header. */
  complete: boolean;
  calls: number;
  /** Present when a request failed; the sweep is then never `complete`. */
  error?: string;
}

/**
 * Normalise a Bing URL to the `seo_url.path` form.
 *
 * Bing's own samples return a bare `example.com/foo` with no scheme, and our
 * paths always carry a leading and trailing slash (`/` for the home page). Both
 * shapes have to land on the same key or every row looks absent.
 */
export function toTrackedPath(bingUrl: string, hostname: string): string | null {
  let rest = bingUrl.trim();
  if (!rest) return null;
  rest = rest.replace(/^[a-z]+:\/\//i, "");
  const host = hostname.toLowerCase();
  const lower = rest.toLowerCase();
  if (lower === host) return "/";
  if (lower.startsWith(`${host}/`)) {
    rest = rest.slice(host.length);
  } else if (!rest.startsWith("/")) {
    // A URL for some other host is not ours to record.
    return null;
  }
  // Drop query and fragment: our inventory tracks canonical paths only.
  rest = rest.split(/[?#]/)[0] ?? "";
  if (!rest.startsWith("/")) rest = `/${rest}`;
  if (!rest.endsWith("/")) rest = `${rest}/`;
  return rest;
}

/**
 * Read every URL Bing holds index data for under `siteUrl`.
 *
 * `siteUrl` must be the property exactly as verified in Bing Webmaster Tools,
 * or the API answers 400 — that is the single most common setup failure, and
 * `describe()` in ./bing.ts names it.
 */
export async function sweepBingIndex(options: {
  apiKey: string;
  siteUrl: string;
  maxCalls?: number;
}): Promise<BingSweep> {
  const { apiKey, siteUrl } = options;
  const maxCalls = options.maxCalls ?? DEFAULT_MAX_CALLS;
  const hostname = new URL(siteUrl).hostname;

  const byPath = new Map<string, BingUrlInfo>();
  let calls = 0;
  let budgetExhausted = false;

  const record = (info: BingUrlInfo) => {
    const path = toTrackedPath(info.url, hostname);
    // Directory nodes are recursion targets, not pages; recording one would put
    // an `excluded` verdict on a path that may also exist as a real page.
    if (path && info.isPage) byPath.set(path, info);
  };

  // Seed at the root. Bing keys the tree on the bare host, matching its samples.
  const seed = await fetchUrlInfo(apiKey, siteUrl, hostname);
  calls += 1;
  if ("failure" in seed) {
    return { byPath, complete: false, calls, error: seed.failure.message };
  }
  if (seed.info) record(seed.info);

  const queue: { url: string; depth: number }[] = [{ url: seed.info?.url ?? hostname, depth: 0 }];
  const visited = new Set<string>();
  let unvisited = 0;

  while (queue.length > 0) {
    const node = queue.shift()!;
    if (visited.has(node.url) || node.depth > MAX_DEPTH) continue;
    visited.add(node.url);

    for (let page = 0; page < MAX_PAGES_PER_DIR; page += 1) {
      if (calls >= maxCalls) {
        budgetExhausted = true;
        unvisited += queue.length;
        queue.length = 0;
        break;
      }
      const result = await fetchChildren(apiKey, siteUrl, node.url, page);
      calls += 1;
      if ("failure" in result) {
        return { byPath, complete: false, calls, error: result.failure.message };
      }
      // An empty page is the documented terminator for this listing.
      if (result.entries.length === 0) break;

      for (const info of result.entries) {
        record(info);
        if (!info.isPage && info.totalChildUrlCount > 0 && node.depth + 1 <= MAX_DEPTH) {
          queue.push({ url: info.url, depth: node.depth + 1 });
        }
      }
    }
    if (budgetExhausted) break;
  }

  return {
    byPath,
    complete: !budgetExhausted && unvisited === 0 && byPath.size > 0,
    calls,
  };
}

export { DEFAULT_MAX_CALLS, MAX_DEPTH };
