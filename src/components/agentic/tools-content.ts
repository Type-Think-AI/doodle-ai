/**
 * WebMCP tools — editorial article content for Doodle AI.
 *
 * Two read-only tools a page-embedded agent can use to discover and read the
 * site's articles without crawling. Both:
 *
 *   - are `readOnlyHint: true` (they change no state) and
 *     `untrustedContentHint: true` (they return long-form content bodies,
 *     which are externally-authored text an agent must not treat as trusted
 *     instructions);
 *   - forward `context.signal` to every `fetch`;
 *   - NEVER throw — every failure path returns a short, actionable guidance
 *     string instead;
 *   - keep their output strictly under the 1,500-char WebMCP ceiling. The
 *     ceiling is guaranteed by construction (see `HARD_CAP` / the per-item
 *     budgeting below), not by hoping the data is small.
 *
 * This module is SELF-CONTAINED: it defines its own minimal tool type and does
 * not import the registry. Riya owns registration and the wiring into
 * AppLayout.astro; this file only exports the definitions.
 */

/** Minimal local shape of a WebMCP tool definition (the lane contract). */
export interface WebMcpToolDef {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required: string[];
  };
  annotations: {
    readOnlyHint: boolean;
    untrustedContentHint: boolean;
  };
  /**
   * Tool bodies in this codebase return a PLAIN STRING. They are wrapped into
   * the spec's content envelope by `withTextEnvelope` at the registration site,
   * so the `cap()` / `clip()` budget applies to the text an agent actually
   * reads rather than to JSON punctuation.
   */
  execute: (
    args: Record<string, unknown>,
    context?: { signal?: AbortSignal },
  ) => Promise<string>;
}

/**
 * The result shape the WebMCP explainer specifies for a tool's execute callback:
 * an MCP-style content array, not a bare string.
 *
 *   return { content: [{ type: "text", text: "Added todo item …" }] };
 *
 * Chrome currently resolves `executeTool()` to a *serialised* result either way,
 * so a bare string "works" — but a host that unwraps `content[]` (the reference
 * demo, the DevTools panel's Tool Activity view, and any MCP-shaped agent) then
 * sees an opaque blob instead of text, and there is no way to express `isError`
 * or a non-text block. Returning the envelope is the spec-correct contract.
 */
export interface WebMcpTextResult {
  content: { type: "text"; text: string }[];
  isError?: boolean;
}

/** Wrap a plain string in the spec's content envelope. */
export function toTextResult(text: string, isError = false): WebMcpTextResult {
  return isError
    ? { content: [{ type: "text", text }], isError: true }
    : { content: [{ type: "text", text }] };
}

/** A tool definition whose `execute` resolves to the spec's content envelope. */
export interface WebMcpRegistrableTool extends Omit<WebMcpToolDef, "execute"> {
  execute: (
    args: Record<string, unknown>,
    context?: { signal?: AbortSignal },
  ) => Promise<WebMcpTextResult>;
}

/**
 * Adapt a string-returning tool body to the registrable, spec-shaped form.
 *
 * Applied at the single registration site so every tool is enveloped by
 * construction — a new tool cannot be added in the old shape and silently ship
 * a bare string.
 */
export function withTextEnvelope(tool: WebMcpToolDef): WebMcpRegistrableTool {
  return {
    ...tool,
    execute: async (args, context) => {
      try {
        return toTextResult(await tool.execute(args, context));
      } catch (err) {
        /* Tool bodies are written never to throw, but a host must still receive
           a usable result rather than an unhandled rejection. */
        if (err instanceof DOMException && err.name === "AbortError") {
          return toTextResult("The tool call was cancelled.", true);
        }
        return toTextResult(
          `The ${tool.name} tool failed unexpectedly. Try again, or use another tool.`,
          true,
        );
      }
    },
  };
}

/** Absolute WebMCP output ceiling. We stay safely under it. */
const HARD_CAP = 1500;

/** Shape of an entry in /api/agent-index.json. */
interface IndexArticle {
  url: string;
  title: string;
  description: string;
  category: string;
  pubDate?: string;
  updatedDate?: string;
  excerpt?: string;
}

/** Clip text to `max` chars on a word boundary, adding an ellipsis if cut. */
function clip(text: string, max: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const slice = t.slice(0, Math.max(0, max - 1));
  const lastSpace = slice.lastIndexOf(" ");
  return `${(lastSpace > max * 0.5 ? slice.slice(0, lastSpace) : slice).trimEnd()}…`;
}

/** Build an absolute same-origin URL, tolerating a bare path or a full URL. */
function toIndexUrl(): string {
  // In the browser this resolves against the current origin.
  return new URL("/api/agent-index.json", window.location.origin).toString();
}

/**
 * Tool a) search_doodle_articles
 *
 * Optional `query` substring (matched case-insensitively across
 * title+description+category) and optional `limit` (default 3, max 5). Returns
 * a compact ranked list of `title`, `url`, one-line description.
 *
 * OUTPUT BUDGET: capped items × a fixed per-item budget, with a running total
 * guard, so the string can never exceed HARD_CAP regardless of the data.
 */
const search_doodle_articles: WebMcpToolDef = {
  name: "search_doodle_articles",
  description:
    "Search Doodle AI's editorial articles (guides, explainers, prompt packs) by keyword and get a short ranked list of titles, URLs, and one-line descriptions. Read-only. Use this first to find an article, then call get_doodle_article with a returned url to read its body. Optional 'query' filters by substring across title, description, and category; omit it to list the newest articles. Optional 'limit' (1-5, default 3) caps how many are returned.",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description:
          "Case-insensitive substring to match across article title, description, and category. Omit to list the newest articles.",
      },
      limit: {
        type: "integer",
        description: "Max articles to return, 1-5. Defaults to 3.",
        minimum: 1,
        maximum: 5,
      },
    },
    required: [],
  },
  annotations: {
    readOnlyHint: true,
    untrustedContentHint: true,
  },
  execute: async (args, context) => {
    try {
      const rawQuery = typeof args.query === "string" ? args.query.trim() : "";
      const query = rawQuery.toLowerCase();

      let limit = 3;
      if (typeof args.limit === "number" && Number.isFinite(args.limit)) {
        limit = Math.min(5, Math.max(1, Math.floor(args.limit)));
      }

      const res = await fetch(toIndexUrl(), { signal: context?.signal });
      if (!res.ok) {
        return `Could not load the article index (HTTP ${res.status}). Try again shortly.`;
      }
      const data = (await res.json()) as { articles?: IndexArticle[] };
      const all = Array.isArray(data.articles) ? data.articles : [];

      const matched = query
        ? all.filter((a) =>
            `${a.title} ${a.description} ${a.category}`.toLowerCase().includes(query),
          )
        : all;

      if (matched.length === 0) {
        return query
          ? `No Doodle AI articles match "${clip(rawQuery, 60)}". Try a broader keyword, or omit query to list the newest articles.`
          : "No Doodle AI articles are available right now.";
      }

      // Per-item budget: header line + up to `limit` items must fit under
      // HARD_CAP with room for a trailing truncation note. Reserve ~120 chars
      // for the note and header, then split the rest across the items.
      const RESERVE = 140;
      const perItem = Math.floor((HARD_CAP - RESERVE) / limit);

      const selected = matched.slice(0, limit);
      const lines: string[] = [];
      let truncatedCount = matched.length - selected.length;

      for (let i = 0; i < selected.length; i++) {
        const a = selected[i];
        // Reserve chars within the item for title + url + separators, give the
        // rest to the description.
        const title = clip(a.title, 110);
        const url = a.url;
        const fixed = `${i + 1}. ${title}\n${url}\n`;
        const descBudget = Math.max(0, perItem - fixed.length - 1);
        const desc = descBudget > 0 ? clip(a.description, Math.min(descBudget, 160)) : "";
        const line = desc ? `${fixed}${desc}` : fixed.trimEnd();
        lines.push(line);
      }

      let out = `${matched.length} article(s) found. Showing ${selected.length}:\n\n${lines.join("\n\n")}`;

      // Absolute safety net: if anything pushed us over, drop items until we fit.
      while (out.length > HARD_CAP - 60 && lines.length > 1) {
        lines.pop();
        truncatedCount = matched.length - lines.length;
        out = `${matched.length} article(s) found. Showing ${lines.length}:\n\n${lines.join("\n\n")}`;
      }

      if (truncatedCount > 0) {
        out += `\n\n(+${truncatedCount} more not shown — refine query or raise limit up to 5.)`;
      }

      // Final hard clamp — never exceed the ceiling under any circumstance.
      return clip(out, HARD_CAP);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        return "Search was cancelled.";
      }
      return "Could not search articles right now. Try again shortly.";
    }
  },
};

/**
 * Extract readable plain text from an article page's HTML.
 *
 * Prefers the `.article-body` region (the rendered markdown), then `<article>`,
 * then `<main>`, then the document body, so navigation and footer chrome are
 * excluded. Uses DOMParser (available in the browser this tool runs in) rather
 * than regex tag-stripping.
 */
function extractArticleText(html: string): string {
  try {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const root =
      doc.querySelector(".article-body") ??
      doc.querySelector("article") ??
      doc.querySelector("main") ??
      doc.body;
    if (!root) return "";
    // Drop non-prose nodes that carry no readable value.
    root.querySelectorAll("script, style, nav, footer, noscript, svg, form").forEach((n) => n.remove());
    return (root.textContent ?? "").replace(/\s+/g, " ").trim();
  } catch {
    return "";
  }
}

/**
 * Tool b) get_doodle_article
 *
 * Required `url` (a path from search_doodle_articles). Fetches that page,
 * extracts the readable text, returns the FIRST <=1400 chars plus a final line
 * giving the canonical URL to read the rest. Never returns a whole article.
 */
const get_doodle_article: WebMcpToolDef = {
  name: "get_doodle_article",
  description:
    "Read the beginning of one Doodle AI article. Pass 'url' — a path returned by search_doodle_articles (e.g. /photo-to-cartoon/). Returns the first ~1400 characters of the article's readable text plus a link to the canonical page for the rest. Read-only; it never returns the full body. Call search_doodle_articles first to get a valid url.",
  inputSchema: {
    type: "object",
    properties: {
      url: {
        type: "string",
        description:
          "The article path or URL to read, exactly as returned by search_doodle_articles (e.g. /photo-to-cartoon/).",
      },
    },
    required: ["url"],
  },
  annotations: {
    readOnlyHint: true,
    untrustedContentHint: true,
  },
  execute: async (args, context) => {
    const raw = typeof args.url === "string" ? args.url.trim() : "";
    if (!raw) {
      return 'Missing "url". Call search_doodle_articles first, then pass a url from its results.';
    }

    // Resolve to a same-origin absolute URL and reject anything off-origin: a
    // page-embedded agent must not use this tool to fetch arbitrary sites.
    let target: URL;
    try {
      target = new URL(raw, window.location.origin);
    } catch {
      return `Invalid url "${clip(raw, 80)}". Call search_doodle_articles first and pass a url from its results.`;
    }
    if (target.origin !== window.location.origin) {
      return `"${clip(raw, 80)}" is not a Doodle AI article path. Call search_doodle_articles first.`;
    }

    try {
      const res = await fetch(target.toString(), { signal: context?.signal });
      if (res.status === 404) {
        return `No article at "${clip(target.pathname, 80)}". Call search_doodle_articles first.`;
      }
      if (!res.ok) {
        return `Could not load "${clip(target.pathname, 80)}" (HTTP ${res.status}). Try again shortly.`;
      }

      const html = await res.text();
      const text = extractArticleText(html);
      if (!text) {
        return `No readable text found at "${clip(target.pathname, 80)}". It may not be an article — call search_doodle_articles first.`;
      }

      const canonical = target.toString();
      // Trailing line always present; budget the body so body + line <= HARD_CAP.
      const tail = `\n\n[Truncated. Read the full article: ${canonical}]`;
      const bodyBudget = Math.min(1400, HARD_CAP - tail.length);

      if (text.length <= bodyBudget) {
        // Short enough to return whole; still under the ceiling.
        return clip(text, HARD_CAP);
      }

      const body = clip(text, bodyBudget);
      return clip(`${body}${tail}`, HARD_CAP);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        return "Reading the article was cancelled.";
      }
      return `Could not read "${clip(target.pathname, 80)}" right now. Try again shortly.`;
    }
  },
};

/** The article tools, for the registry to consume. */
export const contentTools: WebMcpToolDef[] = [search_doodle_articles, get_doodle_article];
