import { getCollection } from "astro:content";
import { idToPath } from "../../lib/content/reserved-routes";
import { getArticleLinks } from "../../lib/content/articles";

export const prerender = false;

/**
 * GET /api/agent-index.json
 *
 * A compact, machine-readable index of every editorial article, for agents
 * (and the page-embedded WebMCP `search_doodle_articles` tool) to discover
 * content without crawling. It intentionally mirrors what the sitemap lists,
 * but in a shape an agent can filter cheaply.
 *
 * Metadata is read through the same `getArticleLinks` helper the sitemap and
 * `/learn/` use, so a new keyword hub appears here the moment its markdown
 * lands — no manual edit. The one extra field, `excerpt`, is derived from the
 * raw markdown body: we read the collection once, key it by id, and pull the
 * first readable sentence-ish run of prose (<=200 chars). Kept deliberately
 * small and stable so the payload stays predictable.
 */

interface IndexArticle {
  url: string;
  title: string;
  description: string;
  category: string;
  pubDate: string;
  updatedDate?: string;
  excerpt?: string;
}

/**
 * Turn a raw markdown body into a short plain-text excerpt.
 *
 * Cheap and forgiving: skip the leading `**Direct answer:**` lead-in and any
 * heading/image/blockquote lines, take the first real paragraph, strip the
 * common inline markdown, collapse whitespace, and hard-cap at 200 chars on a
 * word boundary. Not a full markdown parser — it only needs to be readable.
 */
function toExcerpt(body: string | undefined, max = 200): string | undefined {
  if (!body) return undefined;

  const paragraph = body
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .find((block) => {
      if (!block) return false;
      const first = block[0];
      // Skip headings, images, blockquotes, list markers, tables, HTML.
      if (first === "#" || first === "!" || first === ">" || first === "|" || first === "<") {
        return false;
      }
      if (/^[-*+]\s/.test(block) || /^\d+\.\s/.test(block)) return false;
      return true;
    });

  if (!paragraph) return undefined;

  const text = paragraph
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "") // images
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") // links -> text
    .replace(/[*_`~]+/g, "") // emphasis / code ticks
    .replace(/\s+/g, " ")
    .trim();

  if (!text) return undefined;
  if (text.length <= max) return text;

  const clipped = text.slice(0, max);
  const lastSpace = clipped.lastIndexOf(" ");
  return `${(lastSpace > 40 ? clipped.slice(0, lastSpace) : clipped).trimEnd()}…`;
}

export async function GET() {
  // Metadata via the shared helper (newest first, keyword-first URLs).
  const links = await getArticleLinks();

  // Bodies, read once and keyed by the same id -> path mapping the helper uses,
  // so the excerpt lines up with each link without re-globbing per article.
  const entries = await getCollection("articles");
  const bodyByPath = new Map<string, string | undefined>(
    entries.map((entry) => [idToPath(entry.id), entry.body]),
  );

  const articles: IndexArticle[] = links.map((link) => {
    const article: IndexArticle = {
      url: link.url,
      title: link.title,
      description: link.description,
      category: link.category,
      pubDate: link.pubDate.toISOString().split("T")[0],
    };
    if (link.updatedDate) {
      article.updatedDate = link.updatedDate.toISOString().split("T")[0];
    }
    const excerpt = toExcerpt(bodyByPath.get(link.path));
    if (excerpt) article.excerpt = excerpt;
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
      // Public, cacheable for an hour, matches the sitemap route's posture.
      "Cache-Control": "public, max-age=3600",
      // Explicitly indexable/followable — this file is public and robots.txt
      // Allows it, so name that intent in the header too (RFC-standard tokens).
      "X-Robots-Tag": "all",
      // Never let a client guess a different type off the body.
      "X-Content-Type-Options": "nosniff",
      // Public, non-credentialed JSON: allow a page-embedded agent on any
      // origin to fetch it. There is nothing account-scoped or secret here.
      "Access-Control-Allow-Origin": "*",
    },
  });
}
