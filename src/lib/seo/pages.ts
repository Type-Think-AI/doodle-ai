/* The canonical inventory of indexable pages, and the ONE place that decides
 * what is indexable.
 *
 * This was lifted out of src/pages/sitemap.xml.ts because a second consumer
 * appeared: the /admin/seo tracker submits URLs to IndexNow. Two hand-maintained
 * lists would drift immediately — a new article would appear in the sitemap and
 * never be submitted, or worse, be submitted while robots were told to ignore
 * it. So the sitemap route and the SEO tracker read the same function, and
 * "indexable" has exactly one definition.
 *
 * IMPORTANT: this module reaches `astro:content`, so it can only be imported
 * from code Astro bundles. The hourly cron in src-worker/entry.ts is bundled by
 * wrangler and must not touch it — see the header of ./inventory.ts for the full
 * argument and how the cron gets this data instead.
 *
 * `title` exists only for the tracker's table. The sitemap has no use for it,
 * which is why it is always populated here anyway: a row reading
 * "/doodle-ideas/" alone is far harder to scan than one reading "Doodle Ideas".
 */
import { SKILLS } from "../skills";
import { CATEGORY_PRIORITY, getArticleLinks } from "../content/articles";
import type { IndexablePage } from "./inventory";

export type { IndexablePage } from "./inventory";
export { SITE_ORIGIN, absoluteUrl } from "./inventory";

/**
 * Every page we want in the index, in sitemap order.
 *
 * Exclusions are deliberate: /boards, /c/[id] and /b/[id] are account-scoped and
 * render a sign-in state to an anonymous crawler, so listing them would submit
 * thin pages for indexing. robots.txt disallows the latter two as well. Private
 * API routes are absent for the same reason — they are not public content.
 */
export async function listIndexablePages(): Promise<IndexablePage[]> {
  const articles = await getArticleLinks();

  // Newest article date doubles as the /learn/ directory's lastmod.
  const newestArticle = articles
    .map((a) => a.updatedDate ?? a.pubDate)
    .sort((a, b) => b.getTime() - a.getTime())[0];

  const studioArticles = articles.filter((a) => a.path.startsWith("for-studios/"));
  const newestStudioArticle = studioArticles
    .map((a) => a.updatedDate ?? a.pubDate)
    .sort((a, b) => b.getTime() - a.getTime())[0];

  return [
    { path: "/", title: "Home", changefreq: "weekly", priority: "1.0" },
    {
      path: "/tools/",
      title: "Free tools",
      lastmod: newestArticle,
      changefreq: "weekly",
      priority: "0.9",
    },
    { path: "/skills/", title: "Skills gallery", changefreq: "weekly", priority: "0.9" },
    { path: "/showcase/", title: "Showcase", changefreq: "weekly", priority: "0.9" },
    {
      path: "/learn/",
      title: "Learn",
      lastmod: newestArticle,
      changefreq: "weekly",
      priority: "0.8",
    },
    { path: "/about/", title: "About", changefreq: "monthly", priority: "0.6" },
    { path: "/status/", title: "Status", changefreq: "daily", priority: "0.4" },
    { path: "/terms-of-service/", title: "Terms of service", changefreq: "yearly", priority: "0.3" },
    { path: "/privacy-policy/", title: "Privacy policy", changefreq: "yearly", priority: "0.3" },
    ...SKILLS.filter((s) => s.runnable).map((skill) => ({
      path: `/skills/${skill.id}/`,
      title: `Skill — ${skill.name}`,
      changefreq: "monthly" as const,
      priority: "0.7",
    })),
    // The B2B namespace index only exists while it has children.
    ...(studioArticles.length > 0
      ? [
          {
            path: "/for-studios/",
            title: "For studios",
            lastmod: newestStudioArticle,
            changefreq: "monthly" as const,
            priority: "0.6",
          },
        ]
      : []),
    ...articles.map((article) => ({
      path: article.url,
      title: article.title,
      lastmod: article.updatedDate ?? article.pubDate,
      changefreq: "monthly" as const,
      priority: CATEGORY_PRIORITY[article.category],
    })),
  ];
}
