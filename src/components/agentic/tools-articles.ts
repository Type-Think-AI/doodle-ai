/**
 * WebMCP tools — navigable article READING for Doodle AI (Lane B).
 *
 * The site's 10 editorial articles are 5,278–7,032 words (~37,000 chars) each,
 * with 13–19 `##` sections. Google's WebMCP rules cap a SINGLE tool output at
 * 1,500 chars, so an agent can neither read a whole article in one call nor,
 * with search alone, prove it has seen every article. This module fixes both:
 *
 *   1. list_doodle_articles  — paginated inventory of ALL 10 articles, with the
 *      exact next call, so an agent can enumerate the entire corpus.
 *   2. list_article_sections — the H2 outline of one article (slug + title),
 *      plus section and word counts.
 *   3. read_article_section  — the body text of ONE section, paged, with an
 *      explicit continuation marker. Accepts a slug OR a 1-based index.
 *   4. read_article_page     — sequential whole-article reading in ≤1500-char
 *      windows, `page N of M`, for an agent that does not want to reason about
 *      sections.
 *
 * Every tool here:
 *   - is `readOnlyHint: true`. `untrustedContentHint` is `true` for the two that
 *     return editorial body text (read_article_section, read_article_page) and
 *     `false` for the two that return first-party structural metadata
 *     (list_doodle_articles, list_article_sections);
 *   - forwards `context.signal` into every fetch and handles `AbortError`;
 *   - NEVER throws — every failure path returns a short, actionable guidance
 *     string naming the tool to call next;
 *   - refuses off-origin URLs;
 *   - stays under the 1,500-char ceiling BY CONSTRUCTION: `cap()` is the last
 *     thing applied to every return value.
 *
 * PAGINATION IS DETERMINISTIC AND STABLE. Page windows are computed by a pure
 * walk over a fixed source string (the concatenated article text, or one
 * section's text), so the same `(url, page)` — or `(url, section, page)` —
 * always yields the same window. An agent can resume, re-read, or jump around
 * freely. An out-of-range page NEVER returns an empty string; it returns
 * guidance naming the valid range.
 *
 * This module is SELF-CONTAINED apart from the shared registry types. It
 * declares its own local helpers; it does not import private helpers from other
 * lanes' files.
 */
import { type ToolBundle, always } from "./registry";
import type { WebMcpToolDef } from "./tools-content";

/** Absolute WebMCP output ceiling. We stay safely under it. */
const HARD_CAP = 1500;

/**
 * Body budget for one page window BEFORE its continuation marker is appended.
 * The marker is short (< ~110 chars) and always fits within HARD_CAP after this
 * body; `cap()` is still applied last as an absolute backstop.
 */
const PAGE_BODY = 1350;

/* ----------------------------------------------------- frozen data shapes -- */

/** One section entry in the cheap index (`/api/agent/articles.json`). */
interface IndexSection {
  slug: string;
  title: string;
}

/** One article entry in the cheap index (`/api/agent/articles.json`). */
interface IndexArticle {
  url: string;
  title: string;
  description: string;
  category: string;
  cluster: string;
  pubDate?: string;
  updatedDate?: string;
  wordCount: number;
  sectionCount: number;
  hasFaq?: boolean;
  sections: IndexSection[];
}

/** The cheap index response. */
interface ArticlesIndex {
  generatedAt?: string;
  count?: number;
  articles?: IndexArticle[];
}

/** One full section in the per-article response (`/api/agent/article.json`). */
interface FullSection {
  slug: string;
  title: string;
  depth?: number;
  index?: number;
  chars?: number;
  text: string;
}

/** The per-article full response. */
interface FullArticle {
  url: string;
  title: string;
  description?: string;
  category?: string;
  cluster?: string;
  wordCount?: number;
  faq?: { question: string; answer: string }[];
  sections?: FullSection[];
}

/* ----------------------------------------------------------- helpers ------ */

/** Absolute cap — never exceed the ceiling, applied LAST to every return. */
function cap(text: string): string {
  if (text.length <= HARD_CAP) return text;
  return `${text.slice(0, HARD_CAP - 1).trimEnd()}…`;
}

/** Clip text to `max` chars on a word boundary, adding an ellipsis if cut. */
function clip(text: string, max: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const slice = t.slice(0, Math.max(0, max - 1));
  const lastSpace = slice.lastIndexOf(" ");
  return `${(lastSpace > max * 0.5 ? slice.slice(0, lastSpace) : slice).trimEnd()}…`;
}

/** Coerce an arg to a trimmed string, else "". */
function asStr(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/**
 * Coerce a section arg to a trimmed string, accepting a slug string
 * ("introduction"), a JS number (2), or a numeric string ("2"). A finite number
 * is rendered as its integer form so downstream index parsing is unambiguous;
 * anything else is "".
 */
function asSectionRef(v: unknown): string {
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(Math.trunc(v));
  return "";
}

/** Coerce an arg to a bounded integer with a default. */
function asInt(v: unknown, def: number, min: number, max: number): number {
  if (typeof v === "number" && Number.isFinite(v)) {
    return Math.min(max, Math.max(min, Math.floor(v)));
  }
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) {
    return Math.min(max, Math.max(min, Math.floor(Number(v))));
  }
  return def;
}

/**
 * Resolve a caller-supplied path/URL to a same-origin absolute URL. Returns
 * `null` when it is invalid or off-origin — a page-embedded agent must not use
 * these tools to fetch arbitrary sites.
 */
function sameOriginUrl(raw: string): URL | null {
  try {
    const u = new URL(raw, window.location.origin);
    if (u.origin !== window.location.origin) return null;
    return u;
  } catch {
    return null;
  }
}

/** Absolute URL for the cheap index endpoint. */
function articlesIndexUrl(): string {
  return new URL("/api/agent/articles.json", window.location.origin).toString();
}

/** Absolute URL for the full-article endpoint, path passed as a query arg. */
function articleUrl(path: string): string {
  const u = new URL("/api/agent/article.json", window.location.origin);
  u.searchParams.set("path", path);
  return u.toString();
}

/** Normalise a path for comparison (strip a single trailing slash except root). */
function normPath(p: string): string {
  if (p.length > 1 && p.endsWith("/")) return p.slice(0, -1);
  return p;
}

/** Fetch + parse JSON, returning `{ ok, status, data }` and never throwing. */
async function getJson<T>(
  url: string,
  signal?: AbortSignal,
): Promise<{ ok: boolean; status: number; data: T | null; aborted: boolean }> {
  try {
    const res = await fetch(url, { signal });
    if (!res.ok) return { ok: false, status: res.status, data: null, aborted: false };
    const data = (await res.json()) as T;
    return { ok: true, status: res.status, data, aborted: false };
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return { ok: false, status: 0, data: null, aborted: true };
    }
    return { ok: false, status: 0, data: null, aborted: false };
  }
}

/**
 * Deterministic, stable pagination over a fixed source string.
 *
 * Walks `source` from offset 0 in fixed-size windows. Each window is at most
 * `budget` chars and ends on the best available boundary WITHIN the remaining
 * text — paragraph (`\n\n`), then sentence (`. ` / `.\n` / `! ` / `? `), then
 * word (last space) — never mid-word. The walk is pure, so page N is always the
 * same window regardless of call order or history.
 *
 * Returns the 1-based page's `text`, the total page count `pages`, and a
 * `hasMore` flag. `page` out of range yields `text: null` so the caller can
 * emit range guidance instead of an empty string.
 */
function paginate(
  source: string,
  page: number,
  budget: number,
): { text: string | null; pages: number; hasMore: boolean } {
  const src = source.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (src.length === 0) return { text: null, pages: 0, hasMore: false };

  // Build the deterministic window boundaries once by walking start->end.
  const windows: string[] = [];
  let cursor = 0;
  while (cursor < src.length) {
    const remaining = src.length - cursor;
    if (remaining <= budget) {
      windows.push(src.slice(cursor).trim());
      break;
    }
    const chunk = src.slice(cursor, cursor + budget);
    // Prefer paragraph, then sentence, then word boundary within this chunk.
    let cut = chunk.lastIndexOf("\n\n");
    if (cut < budget * 0.5) {
      const sentence = Math.max(
        chunk.lastIndexOf(". "),
        chunk.lastIndexOf(".\n"),
        chunk.lastIndexOf("! "),
        chunk.lastIndexOf("? "),
      );
      if (sentence >= budget * 0.5) {
        cut = sentence + 1; // keep the terminal punctuation with the sentence
      } else {
        const word = chunk.lastIndexOf(" ");
        cut = word > 0 ? word : budget; // last resort: hard split (rare)
      }
    }
    const end = cursor + cut;
    windows.push(src.slice(cursor, end).trim());
    cursor = end;
    // Skip whitespace at the seam so the next window does not start with it.
    while (cursor < src.length && /\s/.test(src[cursor])) cursor++;
  }

  const pages = windows.length;
  if (page < 1 || page > pages) return { text: null, pages, hasMore: false };
  return { text: windows[page - 1], pages, hasMore: page < pages };
}

/** Load the cheap index and return its articles, or `null` on failure. */
async function loadIndex(
  signal?: AbortSignal,
): Promise<{ articles: IndexArticle[] } | { error: string }> {
  const r = await getJson<ArticlesIndex>(articlesIndexUrl(), signal);
  if (r.aborted) return { error: "The request was cancelled." };
  if (!r.ok || !r.data) {
    return {
      error: `Could not load the article index (HTTP ${r.status || "network error"}). Try again shortly.`,
    };
  }
  const articles = Array.isArray(r.data.articles) ? r.data.articles : [];
  return { articles };
}

/** Load one full article by same-origin path, or return a guidance string. */
async function loadArticle(
  raw: string,
  signal?: AbortSignal,
): Promise<FullArticle | { error: string }> {
  const u = sameOriginUrl(raw);
  if (!u) {
    return {
      error: `"${clip(raw, 80)}" is not a Doodle AI article path. Call list_doodle_articles first.`,
    };
  }
  const r = await getJson<FullArticle>(articleUrl(u.pathname), signal);
  if (r.aborted) return { error: "Reading the article was cancelled." };
  if (r.status === 404) {
    return {
      error: `No article at "${clip(u.pathname, 80)}". Call list_doodle_articles first.`,
    };
  }
  if (!r.ok || !r.data) {
    return {
      error: `Could not load "${clip(u.pathname, 80)}" (HTTP ${r.status || "network error"}). Try again shortly.`,
    };
  }
  return r.data;
}

/* ----------------------------------------------- 1) list_doodle_articles -- */

/**
 * Paginated inventory of ALL 10 articles. Filterable by category/cluster.
 * Returns title + url + one-line description per item, then a trailing line
 * with the total and the EXACT next call, so an agent can page through the
 * whole corpus and prove it has seen every article.
 */
const list_doodle_articles: WebMcpToolDef = {
  name: "list_doodle_articles",
  description:
    "List Doodle AI's editorial articles (guides, explainers, prompt packs, studio pieces) as a paginated inventory of title, url, and one-line description. Read-only, first-party metadata. Use this to enumerate EVERY article — search alone cannot prove full coverage. Optional 'category' and 'cluster' filter the set. Page with 'limit' (1-5, default 3) and 'offset' (default 0); the reply gives the total and the exact next call. Then read one with list_article_sections or read_article_page.",
  inputSchema: {
    type: "object",
    properties: {
      category: {
        type: "string",
        enum: ["guide", "explainer", "prompts", "studios"],
        description:
          "Optional. Restrict to one category: guide, explainer, prompts, or studios. Omit to include all.",
      },
      cluster: {
        type: "string",
        enum: ["cartoon", "pets", "stickers", "gifts", "social", "studios"],
        description:
          "Optional. Restrict to one topic cluster: cartoon, pets, stickers, gifts, social, or studios. Omit for all.",
      },
      limit: {
        type: "integer",
        description: "How many articles to return, 1-5. Defaults to 3.",
        minimum: 1,
        maximum: 5,
      },
      offset: {
        type: "integer",
        description: "How many articles to skip before this page. Defaults to 0.",
        minimum: 0,
      },
    },
    required: [],
  },
  annotations: {
    readOnlyHint: true,
    untrustedContentHint: false,
  },
  execute: async (args, context) => {
    const category = asStr(args.category).toLowerCase();
    const cluster = asStr(args.cluster).toLowerCase();
    const limit = asInt(args.limit, 3, 1, 5);
    const offset = asInt(args.offset, 0, 0, 1_000_000);

    const loaded = await loadIndex(context?.signal);
    if ("error" in loaded) return cap(loaded.error);

    let all = loaded.articles;
    if (category) all = all.filter((a) => (a.category ?? "").toLowerCase() === category);
    if (cluster) all = all.filter((a) => (a.cluster ?? "").toLowerCase() === cluster);

    const total = all.length;
    if (total === 0) {
      const filt = [category && `category "${category}"`, cluster && `cluster "${cluster}"`]
        .filter(Boolean)
        .join(" and ");
      return cap(
        filt
          ? `No Doodle AI articles match ${filt}. Call list_doodle_articles with no filter to see all 10.`
          : "No Doodle AI articles are available right now.",
      );
    }
    if (offset >= total) {
      return cap(
        `Offset ${offset} is past the end (${total} article(s) total). Call list_doodle_articles with offset 0.`,
      );
    }

    const page = all.slice(offset, offset + limit);
    // Per-item budget so N items + a trailing line always fit under HARD_CAP.
    const RESERVE = 160;
    const perItem = Math.floor((HARD_CAP - RESERVE) / page.length);

    const lines = page.map((a, i) => {
      const n = offset + i + 1;
      const fixed = `${n}. ${clip(a.title, 100)}\n${a.url}\n`;
      const descBudget = Math.max(0, Math.min(160, perItem - fixed.length - 1));
      const desc = descBudget > 0 ? clip(a.description ?? "", descBudget) : "";
      return desc ? `${fixed}${desc}` : fixed.trimEnd();
    });

    const shownEnd = offset + page.length;
    let tail: string;
    if (shownEnd < total) {
      tail = `\n\nShowing ${offset + 1}-${shownEnd} of ${total}. Next: list_doodle_articles { offset: ${shownEnd}, limit: ${limit}${category ? `, category: "${category}"` : ""}${cluster ? `, cluster: "${cluster}"` : ""} }`;
    } else {
      tail = `\n\nShowing ${offset + 1}-${shownEnd} of ${total}. That is every matching article. Read one with read_article_page { url } or list_article_sections { url }.`;
    }

    return cap(`${lines.join("\n\n")}${tail}`);
  },
};

/* --------------------------------------------- 2) list_article_sections -- */

/**
 * The H2 outline for one article: numbered `index. slug — title` lines, plus a
 * section count and word count. Paginates via `offset` if a pathological
 * article's outline would not fit, rather than truncating silently.
 */
const list_article_sections: WebMcpToolDef = {
  name: "list_article_sections",
  description:
    "Show the section outline (H2 headings) of one Doodle AI article: a numbered list of slug and title, plus the section count and word count. Read-only, first-party metadata. Pass 'url' (a path from list_doodle_articles, e.g. /photo-to-cartoon/). Optional 'offset' pages the outline if it is long. Use the slug OR the 1-based number with read_article_section to read a section, or read_article_page to read straight through.",
  inputSchema: {
    type: "object",
    properties: {
      url: {
        type: "string",
        description:
          "Article path or URL from list_doodle_articles, e.g. /photo-to-cartoon/. Required.",
      },
      offset: {
        type: "integer",
        description: "How many sections to skip before listing. Defaults to 0.",
        minimum: 0,
      },
    },
    required: ["url"],
  },
  annotations: {
    readOnlyHint: true,
    untrustedContentHint: false,
  },
  execute: async (args, context) => {
    const raw = asStr(args.url);
    if (!raw) {
      return cap('Missing "url". Call list_doodle_articles first, then pass a url.');
    }
    const offset = asInt(args.offset, 0, 0, 1_000_000);

    const art = await loadArticle(raw, context?.signal);
    if ("error" in art) return cap(art.error);

    const sections = Array.isArray(art.sections) ? art.sections : [];
    const total = sections.length;
    const wc = typeof art.wordCount === "number" ? art.wordCount : 0;

    if (total === 0) {
      return cap(
        `"${clip(art.title || raw, 80)}" has no listed sections. Read it straight through with read_article_page { url: "${normPath(raw)}/" }.`,
      );
    }
    if (offset >= total) {
      return cap(
        `Offset ${offset} is past the end (${total} sections). Call list_article_sections with offset 0.`,
      );
    }

    const header = `${clip(art.title || raw, 90)} — ${total} sections, ~${wc} words\n`;
    // Fit as many outline lines as the budget allows from `offset`.
    const RESERVE = header.length + 120;
    const lines: string[] = [];
    let used = 0;
    let i = offset;
    for (; i < total; i++) {
      const s = sections[i];
      const line = `${i + 1}. ${s.slug} — ${clip(s.title, 80)}`;
      if (used + line.length + 1 > HARD_CAP - RESERVE) break;
      lines.push(line);
      used += line.length + 1;
    }

    const shownEnd = i; // exclusive
    let tail: string;
    if (shownEnd < total) {
      tail = `\n\nSections ${offset + 1}-${shownEnd} of ${total}. Next: list_article_sections { url: "${normPath(raw)}/", offset: ${shownEnd} }`;
    } else {
      tail = `\n\nAll ${total} sections. Read one with read_article_section { url, section }, or read straight through with read_article_page { url }.`;
    }

    return cap(`${header}\n${lines.join("\n")}${tail}`);
  },
};

/* ----------------------------------------------- 3) read_article_section -- */

/**
 * THE UNLOCK. Returns one section's body text for the requested page, and ALWAYS
 * ends with a continuation marker stating whether more pages exist and the exact
 * next call. `section` accepts a slug OR a 1-based index from
 * list_article_sections. Unknown slug returns guidance listing a few valid slugs.
 */
const read_article_section: WebMcpToolDef = {
  name: "read_article_section",
  description:
    "Read the body text of ONE section of a Doodle AI article, paged to fit the limit. Pass 'url' and 'section' — 'section' is EITHER a slug or a 1-based number from list_article_sections. Optional 'page' (>=1, default 1) reads further into a long section. The reply always ends with whether more pages exist and the exact next call. Pagination is stable: the same page always returns the same text. Call list_article_sections first to get valid slugs.",
  inputSchema: {
    type: "object",
    properties: {
      url: {
        type: "string",
        description:
          "Article path or URL from list_doodle_articles, e.g. /photo-to-cartoon/. Required.",
      },
      section: {
        type: "string",
        description:
          "The section to read: a slug (e.g. what-you-need) or its 1-based number from list_article_sections. A number like 2 is accepted too. Required.",
      },
      page: {
        type: "integer",
        description: "Which page of this section to read, >=1. Defaults to 1.",
        minimum: 1,
      },
    },
    required: ["url", "section"],
  },
  annotations: {
    readOnlyHint: true,
    untrustedContentHint: true,
  },
  execute: async (args, context) => {
    const raw = asStr(args.url);
    const sectionArg = asSectionRef(args.section);
    const page = asInt(args.page, 1, 1, 1_000_000);

    if (!raw) {
      return cap('Missing "url". Call list_doodle_articles first, then pass a url.');
    }
    if (!sectionArg) {
      return cap(
        'Missing "section". Call list_article_sections to get a slug or number, then pass it as section.',
      );
    }

    const art = await loadArticle(raw, context?.signal);
    if ("error" in art) return cap(art.error);

    const sections = Array.isArray(art.sections) ? art.sections : [];
    if (sections.length === 0) {
      return cap(
        `"${clip(art.title || raw, 80)}" has no readable sections. Read it with read_article_page { url: "${normPath(raw)}/" }.`,
      );
    }

    // Resolve section unambiguously:
    //   1. If the value is a slug that exists, treat it as a slug.
    //   2. Otherwise, if it parses cleanly as an integer, treat it as a 1-based
    //      index — an in-range index resolves, an out-of-range one (including 0
    //      and negatives) returns RANGE guidance naming the valid range.
    //   3. Otherwise it is an unknown slug — return slug guidance.
    const want = sectionArg.toLowerCase();
    let idx = sections.findIndex((s) => (s.slug ?? "").toLowerCase() === want);

    if (idx < 0 && /^-?\d+$/.test(sectionArg)) {
      const asIndex = Number(sectionArg);
      if (Number.isInteger(asIndex) && asIndex >= 1 && asIndex <= sections.length) {
        idx = asIndex - 1;
      } else {
        return cap(
          `Section ${asIndex} is out of range. This article has ${sections.length} sections. Call list_article_sections { url: "${normPath(raw)}/" }.`,
        );
      }
    }

    if (idx < 0) {
      const sample = sections.slice(0, 4).map((s) => s.slug).join(", ");
      return cap(
        `No section "${clip(sectionArg, 60)}" in this article. Valid slugs include: ${sample}${sections.length > 4 ? ", …" : ""}. Call list_article_sections { url } for the full outline.`,
      );
    }

    const sec = sections[idx];
    const body = (sec.text ?? "").trim();
    const label = `[${idx + 1}/${sections.length}] ${clip(sec.title || sec.slug, 90)}`;

    if (body.length === 0) {
      return cap(
        `${label}\n\n(This section has no body text.) Next: read_article_section { url: "${normPath(raw)}/", section: ${idx + 2 <= sections.length ? idx + 2 : 1} }`,
      );
    }

    // Reserve room for the header label + a continuation marker line.
    const perPage = PAGE_BODY - label.length - 4;
    const { text, pages, hasMore } = paginate(body, page, perPage);

    if (text === null) {
      return cap(
        `Section "${sec.slug}" has ${pages} page(s); page ${page} is out of range. Read page 1 with read_article_section { url: "${normPath(raw)}/", section: "${sec.slug}", page: 1 }.`,
      );
    }

    let marker: string;
    if (hasMore) {
      marker = `\n\n— page ${page} of ${pages}. More: read_article_section { url: "${normPath(raw)}/", section: "${sec.slug}", page: ${page + 1} }`;
    } else if (idx + 1 < sections.length) {
      marker = `\n\n— page ${page} of ${pages} (section end). Next section: read_article_section { url: "${normPath(raw)}/", section: ${idx + 2} }`;
    } else {
      marker = `\n\n— page ${page} of ${pages} (last section, article end).`;
    }

    return cap(`${label}\n\n${text}${marker}`);
  },
};

/* ------------------------------------------------- 4) read_article_page -- */

/**
 * Sequential whole-article reading for an agent that does not want to reason
 * about sections. Pages the full concatenated article text (section titles
 * inlined as headings) in ≤1500-char windows, cutting on paragraph/sentence/word
 * boundaries never mid-word, and states `page N of M` plus the next call every
 * time. Stable: the same (url, page) always returns the same window.
 */
const read_article_page: WebMcpToolDef = {
  name: "read_article_page",
  description:
    "Read a Doodle AI article straight through, one page at a time, without choosing sections. Pass 'url' (a path from list_doodle_articles) and optional 'page' (>=1, default 1). Returns that page of the full article text in a limit-sized window and always states 'page N of M' plus the exact next call. Pagination is stable — the same page always returns the same text, so you can resume or re-read. Call list_doodle_articles first for a valid url.",
  inputSchema: {
    type: "object",
    properties: {
      url: {
        type: "string",
        description:
          "Article path or URL from list_doodle_articles, e.g. /photo-to-cartoon/. Required.",
      },
      page: {
        type: "integer",
        description: "Which page of the whole article to read, >=1. Defaults to 1.",
        minimum: 1,
      },
    },
    required: ["url"],
  },
  annotations: {
    readOnlyHint: true,
    untrustedContentHint: true,
  },
  execute: async (args, context) => {
    const raw = asStr(args.url);
    const page = asInt(args.page, 1, 1, 1_000_000);

    if (!raw) {
      return cap('Missing "url". Call list_doodle_articles first, then pass a url.');
    }

    const art = await loadArticle(raw, context?.signal);
    if ("error" in art) return cap(art.error);

    const sections = Array.isArray(art.sections) ? art.sections : [];
    // Concatenate the whole article deterministically: title, then each section
    // as "## Title\n\nbody". This fixed string is what pagination walks.
    const parts: string[] = [];
    if (art.title) parts.push(art.title);
    for (const s of sections) {
      const t = (s.text ?? "").trim();
      const heading = clip(s.title || s.slug || "", 120);
      if (heading && t) parts.push(`## ${heading}\n\n${t}`);
      else if (heading) parts.push(`## ${heading}`);
      else if (t) parts.push(t);
    }
    const full = parts.join("\n\n").trim();

    if (full.length === 0) {
      return cap(
        `"${clip(art.title || raw, 80)}" has no readable text. Call list_doodle_articles for another url.`,
      );
    }

    // Reserve room for the continuation marker line appended below.
    const perPage = PAGE_BODY - 4;
    const { text, pages, hasMore } = paginate(full, page, perPage);

    if (text === null) {
      return cap(
        `This article has ${pages} page(s); page ${page} is out of range. Read page 1 with read_article_page { url: "${normPath(raw)}/", page: 1 }.`,
      );
    }

    const marker = hasMore
      ? `\n\n— page ${page} of ${pages}. Next: read_article_page { url: "${normPath(raw)}/", page: ${page + 1} }`
      : `\n\n— page ${page} of ${pages} (article end).`;

    return cap(`${text}${marker}`);
  },
};

/* ---------------------------------------------------------------- bundle -- */

const bundle: ToolBundle = {
  id: "articles",
  appliesTo: always, // useful site-wide: an agent may want to read a guide from any page
  tools: [
    list_doodle_articles,
    list_article_sections,
    read_article_section,
    read_article_page,
  ],
};

export default bundle;
