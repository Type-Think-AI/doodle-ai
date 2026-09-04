/* The page-inventory type, the site origin, and the HTTP way to read the
 * inventory. Deliberately free of Astro imports.
 *
 * WHY THIS FILE EXISTS, because it looks like it could just live in ./pages.ts:
 *
 * `src-worker/entry.ts` is bundled by **wrangler/esbuild**, not by Astro. It
 * therefore cannot resolve Astro virtual modules — and ./pages.ts reaches
 * `astro:content` (through ../content/articles) to read the article collection.
 * An hourly cron that imports ./pages.ts fails the build with
 * `Could not resolve "astro:content"`, which is how this split was found.
 *
 * So the rule is: NOTHING REACHABLE FROM src-worker/entry.ts MAY IMPORT
 * ./pages.ts. The cron reads the inventory over HTTP from an Astro route
 * instead, where the collection resolves normally. `wrangler deploy --dry-run`
 * is what enforces this; if you move a symbol from here into ./pages.ts, that
 * is the check that will tell you.
 */

export interface IndexablePage {
  /** Site-root-relative path with a trailing slash, e.g. "/doodle-ideas/". */
  path: string;
  /** Human label for the admin table. */
  title: string;
  /** Last meaningful content change, when we know it. Drives re-submission. */
  lastmod?: Date;
  changefreq: "daily" | "weekly" | "monthly" | "yearly";
  priority: string;
}

/** Production origin. Used where no inbound request exists to derive one from. */
export const SITE_ORIGIN = "https://doodleai.art";

/** Absolute URL for a tracked path, against `origin`. */
export function absoluteUrl(path: string, origin: string = SITE_ORIGIN): string {
  return new URL(path, origin).href;
}

/** Path of the route that serializes the inventory. */
export const INVENTORY_PATH = "/api/seo/pages.json";

/**
 * Read the inventory over HTTP — the cron's route to the same data the manual
 * sync gets by calling `listIndexablePages()` directly.
 *
 * Throws on a bad response rather than returning an empty list. An empty list
 * would look like "the site has no pages", and `discoverUrls` would dutifully
 * mark all 145 tracked URLs as removed. Failing loudly means the cron logs an
 * error and the table is left alone.
 */
export async function fetchPageInventory(origin: string): Promise<IndexablePage[]> {
  const url = new URL(INVENTORY_PATH, origin).href;
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) {
    throw new Error(`Page inventory at ${url} returned ${response.status}.`);
  }

  const body: unknown = await response.json();
  if (!Array.isArray(body)) {
    throw new Error(`Page inventory at ${url} did not return an array.`);
  }
  if (body.length === 0) {
    throw new Error(`Page inventory at ${url} was empty; refusing to treat that as "no pages".`);
  }

  return body.map((raw, i) => {
    const row = raw as Record<string, unknown>;
    if (typeof row.path !== "string" || !row.path.startsWith("/")) {
      throw new Error(`Page inventory entry ${i} has no usable path.`);
    }
    // `lastmod` crosses JSON as an ISO string; reviving it here keeps every
    // consumer working with Date, same as the direct call does.
    const lastmod = typeof row.lastmod === "string" ? new Date(row.lastmod) : undefined;
    return {
      path: row.path,
      title: typeof row.title === "string" ? row.title : row.path,
      lastmod: lastmod && !Number.isNaN(lastmod.getTime()) ? lastmod : undefined,
      changefreq: (row.changefreq as IndexablePage["changefreq"]) ?? "monthly",
      priority: typeof row.priority === "string" ? row.priority : "0.5",
    };
  });
}
