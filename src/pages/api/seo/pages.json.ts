import { listIndexablePages } from "../../../lib/seo/pages";

export const prerender = false;

/**
 * GET /api/seo/pages.json — the indexable-page inventory, with titles.
 *
 * This exists for exactly one caller: the hourly IndexNow cron in
 * src-worker/entry.ts. That code is bundled by wrangler and cannot resolve
 * `astro:content`, so it cannot call `listIndexablePages()` directly; it reads
 * the same function's output over HTTP from here instead. See the header of
 * src/lib/seo/inventory.ts for why that split is not optional.
 *
 * Unauthenticated, deliberately. Every field is already public: the paths are
 * the ones published in sitemap.xml, and the titles are the `<title>` of those
 * same public pages. Adding auth would mean giving a cron isolate a credential
 * to read information anyone can already crawl. robots.txt disallows /api/ (with
 * a single explicit exception for the agent index), and the noindex header below
 * repeats that at the response level.
 *
 * `changefreq` and `priority` ride along because the inventory is one shape;
 * nothing downstream uses them yet beyond storing them.
 */
export async function GET(): Promise<Response> {
  const pages = await listIndexablePages();

  const body = pages.map((page) => ({
    path: page.path,
    title: page.title,
    lastmod: page.lastmod?.toISOString(),
    changefreq: page.changefreq,
    priority: page.priority,
  }));

  return new Response(JSON.stringify(body), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "X-Robots-Tag": "noindex",
      // Short cache only. The cron runs hourly and wants a current answer; a
      // long TTL would delay a new article's first submission by the TTL.
      "Cache-Control": "public, max-age=60",
    },
  });
}
