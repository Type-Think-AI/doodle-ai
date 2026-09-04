import type { APIContext } from "astro";
import { listIndexablePages } from "../lib/seo/pages";

export const prerender = false;

/**
 * GET /sitemap.xml
 *
 * Hand-built so we control exactly what is listed and what `lastmod` says.
 *
 * The entry list itself now lives in src/lib/seo/pages.ts, because /admin/seo
 * submits the same set of URLs to IndexNow and two copies of "what is
 * indexable" would drift on the first new article. This route is only the XML
 * serialiser; every inclusion/exclusion decision (and the reasoning behind it)
 * is documented there.
 */
export async function GET(context: APIContext) {
  const site = context.site ?? new URL("https://doodleai.art");
  const entries = await listIndexablePages();

  const urls = entries
    .map((e) => {
      const loc = new URL(e.path, site).href;
      const lastmod = e.lastmod
        ? `\n    <lastmod>${e.lastmod.toISOString().split("T")[0]}</lastmod>`
        : "";
      return `  <url>
    <loc>${loc}</loc>${lastmod}
    <changefreq>${e.changefreq}</changefreq>
    <priority>${e.priority}</priority>
  </url>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
