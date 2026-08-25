import type { APIContext } from "astro";
import { SKILLS } from "../lib/skills";
import { CATEGORY_PRIORITY, getArticleLinks } from "../lib/content/articles";

export const prerender = false;

/**
 * GET /sitemap.xml
 *
 * Hand-built so we control exactly what is listed and what `lastmod` says.
 *
 * Only indexable pages appear here; private API routes are excluded
 * because they are not public content, and listing them in a sitemap
 * sends search engines contradictory signals.
 *
 * Editorial articles are read from the `articles` collection, so a new keyword
 * hub appears here the moment its markdown file lands — no manual edit.
 */

interface Entry {
  path: string;
  lastmod?: Date;
  changefreq: "daily" | "weekly" | "monthly" | "yearly";
  priority: string;
}

export async function GET(context: APIContext) {
  const site = context.site ?? new URL("https://doodleai.art");

  const articles = await getArticleLinks();

  // Newest article date doubles as the /learn/ directory's lastmod.
  const newestArticle = articles
    .map((a) => a.updatedDate ?? a.pubDate)
    .sort((a, b) => b.getTime() - a.getTime())[0];

  const studioArticles = articles.filter((a) => a.path.startsWith("for-studios/"));
  const newestStudioArticle = studioArticles
    .map((a) => a.updatedDate ?? a.pubDate)
    .sort((a, b) => b.getTime() - a.getTime())[0];

  const entries: Entry[] = [
    // "/" is now a personal chat landing page (client-rendered, per-browser
    // localStorage state) — no unique public content to index. /skills is
    // the app's real public content (the marketplace + each skill's page).
    { path: "/skills/", changefreq: "weekly", priority: "0.9" },
    { path: "/learn/", lastmod: newestArticle, changefreq: "weekly", priority: "0.8" },
    { path: "/about/", changefreq: "monthly", priority: "0.6" },
    { path: "/terms-of-service/", changefreq: "yearly", priority: "0.3" },
    { path: "/privacy-policy/", changefreq: "yearly", priority: "0.3" },
    ...SKILLS.filter((s) => s.runnable).map((skill) => ({
      path: `/skills/${skill.id}/`,
      changefreq: "monthly" as const,
      priority: "0.7",
    })),
    // The B2B namespace index only exists while it has children.
    ...(studioArticles.length > 0
      ? [
          {
            path: "/for-studios/",
            lastmod: newestStudioArticle,
            changefreq: "monthly" as const,
            priority: "0.6",
          },
        ]
      : []),
    // Keyword-first article URLs, priority by editorial format.
    ...articles.map((article) => ({
      path: article.url,
      lastmod: article.updatedDate ?? article.pubDate,
      changefreq: "monthly" as const,
      priority: CATEGORY_PRIORITY[article.category],
    })),
  ];

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
