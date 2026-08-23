import type { APIContext } from "astro";
import { getCollection } from "astro:content";
import { SKILLS } from "../lib/skills";

export const prerender = false;

/**
 * GET /sitemap.xml
 *
 * Hand-built so we control exactly what is listed and what `lastmod` says.
 *
 * Only indexable pages appear here; private API routes are excluded
 * because they are not public content, and listing them in a sitemap
 * sends search engines contradictory signals.
 */

interface Entry {
  path: string;
  lastmod?: Date;
  changefreq: "daily" | "weekly" | "monthly" | "yearly";
  priority: string;
}

export async function GET(context: APIContext) {
  const site = context.site ?? new URL("https://doodleai.art");

  const posts = await getCollection("blog");

  // Newest post date doubles as the blog index's lastmod.
  const newestPost = posts
    .map((p) => p.data.updatedDate ?? p.data.pubDate)
    .sort((a, b) => b.getTime() - a.getTime())[0];

  const entries: Entry[] = [
    // "/" is now a personal chat landing page (client-rendered, per-browser
    // localStorage state) — no unique public content to index. /skills is
    // the app's real public content (the marketplace + each skill's page).
    { path: "/skills/", changefreq: "weekly", priority: "0.9" },
    { path: "/blog/", lastmod: newestPost, changefreq: "weekly", priority: "0.8" },
    { path: "/about/", changefreq: "monthly", priority: "0.6" },
    { path: "/terms/", changefreq: "yearly", priority: "0.3" },
    { path: "/privacy/", changefreq: "yearly", priority: "0.3" },
    ...SKILLS.filter((s) => s.runnable).map((skill) => ({
      path: `/skills/${skill.id}/`,
      changefreq: "monthly" as const,
      priority: "0.7",
    })),
    ...posts.map((post) => ({
      path: `/blog/${post.id}/`,
      lastmod: post.data.updatedDate ?? post.data.pubDate,
      changefreq: "monthly" as const,
      priority: "0.7",
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
