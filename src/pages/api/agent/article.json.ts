import type { APIContext } from "astro";
import { getCollection } from "astro:content";
import { idToPath } from "../../../lib/content/reserved-routes";
import { getArticleLinks } from "../../../lib/content/articles";
import { splitIntoSections, countWords } from "../../../lib/content/article-sections";

export const prerender = false;

/**
 * GET /api/agent/article.json?path=/photo-to-cartoon/
 *
 * One article in full: metadata plus every section as readable plain text, so
 * a WebMCP tool can read the whole body in budget-sized pieces (the tool caps
 * each slice; this endpoint hands over the complete parse). Part of the FROZEN
 * contract in docs/webmcp-lane-brief.md § Data sources — four other lanes code
 * against this shape.
 *
 * Path handling is deliberately forgiving: `path` is accepted with or without
 * leading/trailing slashes and normalised to the collection's canonical form
 * (`photo-to-cartoon`, `ai-cartoon-generator/prompts`). Failure modes return a
 * small JSON `{ error }` object — never a thrown 500 — and name
 * /api/agent/articles.json as the way to get a valid path:
 *
 *   - missing `path`            -> 400
 *   - unknown / non-article path -> 404
 *
 * Section slugs are byte-identical to the on-page heading anchors (see
 * article-sections.ts), so `${url}#${section.slug}` scrolls to the section.
 */

interface ResponseSection {
  slug: string;
  title: string;
  depth: number;
  index: number;
  chars: number;
  text: string;
}

/** Small JSON error body, shared shape for 400 and 404. */
function errorResponse(status: number, error: string): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      // Errors are not worth caching for long; keep them fresh.
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

/**
 * Normalise a caller-supplied path to the collection's canonical id-path.
 *
 * Strips leading/trailing slashes and whitespace, collapses internal double
 * slashes, and runs `idToPath` so a stray `.../index` folds to the hub root —
 * matching exactly how `[...path].astro` derives article URLs. Returns "" for
 * an empty/whitespace path so the caller can distinguish "missing" upstream.
 */
function normalisePath(raw: string): string {
  const trimmed = raw.trim().replace(/^\/+/, "").replace(/\/+$/, "").replace(/\/{2,}/g, "/");
  return idToPath(trimmed);
}

export async function GET({ url }: APIContext) {
  const rawPath = url.searchParams.get("path");
  if (rawPath === null || rawPath.trim() === "") {
    return errorResponse(
      400,
      'Missing "path" query parameter. Call /api/agent/articles.json to list valid article paths.',
    );
  }

  const wanted = normalisePath(rawPath);

  // Match against the canonical link set so we honour the same URL derivation
  // (and reject anything that is not an editorial article).
  const links = await getArticleLinks();
  const link = links.find((l) => l.path === wanted);
  if (!link) {
    return errorResponse(
      404,
      `No article at "${rawPath}". Call /api/agent/articles.json to list valid article paths.`,
    );
  }

  const entries = await getCollection("articles");
  const entry = entries.find((e) => idToPath(e.id) === wanted);
  const body = entry?.body ?? "";
  const sections = splitIntoSections(body);

  const payload = {
    url: link.url,
    title: link.title,
    description: link.description,
    category: link.category,
    cluster: link.cluster,
    pubDate: link.pubDate.toISOString().split("T")[0],
    ...(link.updatedDate ? { updatedDate: link.updatedDate.toISOString().split("T")[0] } : {}),
    wordCount: countWords(body),
    faq: (entry?.data.faq ?? []).map((f) => ({ question: f.question, answer: f.answer })),
    sections: sections.map<ResponseSection>((s) => ({
      slug: s.slug,
      title: s.title,
      depth: s.depth,
      index: s.index,
      chars: s.chars,
      text: s.text,
    })),
  };

  return new Response(JSON.stringify(payload), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      // Worker-sane public caching with SWR, per the brief.
      "Cache-Control": "public, max-age=300, stale-while-revalidate=86400",
      "X-Robots-Tag": "all",
      "X-Content-Type-Options": "nosniff",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
