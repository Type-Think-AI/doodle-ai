import { getCollection } from "astro:content";
import { idToPath } from "../../../lib/content/reserved-routes";
import { getArticleLinks } from "../../../lib/content/articles";
import { splitIntoSections, countWords } from "../../../lib/content/article-sections";

export const prerender = false;

/**
 * GET /api/agent/articles.json
 *
 * The cheap discovery index for the WebMCP content tools: every editorial
 * article with its metadata, word count, and a section OUTLINE (slug + title
 * only — no bodies), so an agent can pick an article and a section before
 * spending its 1,500-char output budget on `article.json`.
 *
 * This is the FROZEN contract in docs/webmcp-lane-brief.md § Data sources.
 * Four other lanes code against this shape; do not change field names or
 * nesting without updating the brief and telling those lanes.
 *
 * Metadata comes through the same `getArticleLinks` helper the sitemap,
 * `/learn/`, and /api/agent-index.json use, so a new keyword hub appears here
 * the moment its markdown lands. Section outlines are derived from the raw
 * body via the shared `splitIntoSections`, so the slugs match the on-page
 * table of contents exactly.
 */

interface OutlineSection {
  slug: string;
  title: string;
}

interface IndexArticle {
  url: string;
  title: string;
  description: string;
  category: string;
  cluster: string;
  pubDate: string;
  updatedDate?: string;
  wordCount: number;
  sectionCount: number;
  hasFaq: boolean;
  sections: OutlineSection[];
}

export async function GET() {
  // Metadata via the shared helper (newest first, keyword-first URLs).
  const links = await getArticleLinks();

  // Bodies + faq, read once and keyed by the same id -> path mapping, so the
  // outline lines up with each link without re-globbing per article.
  const entries = await getCollection("articles");
  const entryByPath = new Map(entries.map((entry) => [idToPath(entry.id), entry]));

  const articles: IndexArticle[] = links.map((link) => {
    const entry = entryByPath.get(link.path);
    const body = entry?.body ?? "";
    const sections = splitIntoSections(body);

    const article: IndexArticle = {
      url: link.url,
      title: link.title,
      description: link.description,
      category: link.category,
      cluster: link.cluster,
      pubDate: link.pubDate.toISOString().split("T")[0],
      wordCount: countWords(body),
      sectionCount: sections.length,
      hasFaq: Boolean(entry?.data.faq && entry.data.faq.length > 0),
      sections: sections.map((s) => ({ slug: s.slug, title: s.title })),
    };
    if (link.updatedDate) {
      article.updatedDate = link.updatedDate.toISOString().split("T")[0];
    }
    return article;
  });

  const payload = {
    generatedAt: new Date().toISOString(),
    count: articles.length,
    articles,
  };

  return new Response(JSON.stringify(payload), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      // Public, cacheable, matches the agent-index route's posture. Slightly
      // shorter (5 min) than that hourly index because section outlines change
      // whenever an article's headings are edited; SWR keeps it snappy.
      "Cache-Control": "public, max-age=300, stale-while-revalidate=86400",
      "X-Robots-Tag": "all",
      "X-Content-Type-Options": "nosniff",
      // Public, non-credentialed JSON: a page-embedded agent may fetch it.
      "Access-Control-Allow-Origin": "*",
    },
  });
}
