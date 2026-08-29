/**
 * WebMCP tools — content DISCOVERY for Doodle AI (Lane C).
 *
 * Lane B makes the ~60,700 words READABLE in budget-sized sections. This lane
 * is the complement: it helps an agent FIND the right place to read, and
 * surfaces assets that are not plain prose (the taxonomy, per-article FAQs,
 * and the prompt library).
 *
 * Four read-only tools, all following the shared lane contract:
 *   - `readOnlyHint: true` (they change no state);
 *   - `untrustedContentHint: true` whenever the return value carries editorial
 *     body text (snippets, FAQ answers, prompt lines); `false` for first-party
 *     structural metadata (the taxonomy);
 *   - forward `context.signal` into every `fetch` and handle `AbortError`;
 *   - NEVER throw — every failure path returns a short, actionable guidance
 *     string naming the tool to call next;
 *   - refuse off-origin URL input;
 *   - keep output strictly under 1,500 chars, enforced BY CONSTRUCTION via a
 *     final `cap()` on every return value.
 *
 * This module is SELF-CONTAINED. It declares its own local helpers (the brief
 * forbids importing private helpers across lanes) and consumes Lane A's FROZEN
 * endpoints (`/api/agent/articles.json`, `/api/agent/article.json`), degrading
 * with a guidance string on any non-200. It default-exports one ToolBundle.
 */
import { type ToolBundle, always } from "./registry";
import type { WebMcpToolDef } from "./tools-content";

/** Absolute WebMCP output ceiling. We stay safely under it. */
const HARD_CAP = 1500;

/* ------------------------------------------------------- frozen data shapes */

/** A section stub in the cheap index (no body). */
interface IndexSection {
  slug: string;
  title: string;
}

/** An entry in Lane A's cheap index: /api/agent/articles.json */
interface IndexArticle {
  url: string;
  title: string;
  description: string;
  category: string;
  cluster: string;
  pubDate?: string;
  updatedDate?: string;
  wordCount?: number;
  sectionCount?: number;
  hasFaq?: boolean;
  sections?: IndexSection[];
}

/** A full section body from /api/agent/article.json?path=… */
interface FullSection {
  slug: string;
  title: string;
  depth?: number;
  index?: number;
  chars?: number;
  text: string;
}

/** A Q/A pair. */
interface FaqPair {
  question: string;
  answer: string;
}

/** One full article from /api/agent/article.json?path=… */
interface FullArticle {
  url: string;
  title: string;
  description?: string;
  category?: string;
  cluster?: string;
  wordCount?: number;
  faq?: FaqPair[];
  sections?: FullSection[];
}

/* ------------------------------------------------------------- text helpers */

/** Clip text to `max` chars on a word boundary, adding an ellipsis if cut. */
function clip(text: string, max: number): string {
  const t = String(text ?? "").replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const slice = t.slice(0, Math.max(0, max - 1));
  const lastSpace = slice.lastIndexOf(" ");
  return `${(lastSpace > max * 0.5 ? slice.slice(0, lastSpace) : slice).trimEnd()}…`;
}

/** Final, unconditional clamp to the ceiling — the LAST thing every tool applies. */
function cap(text: string): string {
  return clip(text, HARD_CAP);
}

/** Read an integer arg into a [lo, hi] range with a default. */
function intArg(v: unknown, def: number, lo: number, hi: number): number {
  if (typeof v === "number" && Number.isFinite(v)) {
    return Math.min(hi, Math.max(lo, Math.floor(v)));
  }
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (Number.isFinite(n)) return Math.min(hi, Math.max(lo, Math.floor(n)));
  }
  return def;
}

/** Read a trimmed string arg, or "" when absent/blank. */
function strArg(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** Build an absolute same-origin URL for a Lane A endpoint. */
function apiUrl(pathAndQuery: string): string {
  return new URL(pathAndQuery, window.location.origin).toString();
}

/**
 * Resolve a caller-supplied article path to a same-origin path, or return null
 * when it is off-origin or unparseable. A page-embedded agent must not use our
 * tools to fetch arbitrary sites.
 */
function sameOriginPath(raw: string): string | null {
  try {
    const u = new URL(raw, window.location.origin);
    if (u.origin !== window.location.origin) return null;
    return u.pathname;
  } catch {
    return null;
  }
}

const ABORT = "The tool call was cancelled.";
function isAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}

/* --------------------------------------------------------- ranking helpers */

/**
 * Stopwords removed before token-overlap scoring so that generic words
 * ("how", "the", "a") do not dominate the match. Kept small and case-folded.
 */
const STOPWORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "can", "do", "does", "for",
  "from", "how", "i", "in", "into", "is", "it", "make", "my", "of", "on", "or",
  "the", "to", "turn", "use", "using", "what", "when", "which", "who", "why",
  "with", "you", "your",
]);

/** Lowercase, split on non-word chars, drop stopwords and 1-char tokens. */
function tokenize(text: string): string[] {
  return String(text ?? "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

/**
 * Fetch Lane A's cheap index. Returns the articles array, or a guidance string
 * (as `{ error }`) so callers surface the same degradation message.
 */
async function loadIndex(
  signal?: AbortSignal,
): Promise<{ articles?: IndexArticle[]; error?: string }> {
  try {
    const res = await fetch(apiUrl("/api/agent/articles.json"), { signal });
    if (!res.ok) {
      return {
        error: `The article index is unavailable (HTTP ${res.status}). Try list_doodle_articles, or try again shortly.`,
      };
    }
    const data = (await res.json()) as { articles?: IndexArticle[] };
    const articles = Array.isArray(data.articles) ? data.articles : [];
    return { articles };
  } catch (err) {
    if (isAbort(err)) return { error: ABORT };
    return {
      error: "The article index could not be loaded right now. Try again shortly.",
    };
  }
}

/**
 * Fetch one full article by same-origin path from Lane A's endpoint.
 * Returns the article or a guidance string.
 */
async function loadArticle(
  path: string,
  signal?: AbortSignal,
): Promise<{ article?: FullArticle; error?: string }> {
  try {
    const res = await fetch(
      apiUrl(`/api/agent/article.json?path=${encodeURIComponent(path)}`),
      { signal },
    );
    if (res.status === 404) {
      return { error: `No article at "${clip(path, 80)}". Call list_doodle_topics to find one.` };
    }
    if (!res.ok) {
      return { error: `Could not load "${clip(path, 80)}" (HTTP ${res.status}). Try again shortly.` };
    }
    const article = (await res.json()) as FullArticle;
    return { article };
  } catch (err) {
    if (isAbort(err)) return { error: ABORT };
    return { error: `Could not read "${clip(path, 80)}" right now. Try again shortly.` };
  }
}

/* =========================================================================
 * Tool 1 — find_doodle_answer
 * ========================================================================= */

/**
 * The headline discovery tool. Ranks across ALL articles' SECTIONS and returns
 * the best-matching sections (not whole articles), each ending with the exact
 * read_article_section call to read it in full.
 *
 * WORK BOUND (verified): exactly ONE cheap-index fetch, THEN at most 2 full
 * article fetches for snippet extraction — 3 network fetches WORST CASE.
 * `context.signal` is honoured on every fetch so a cancelled call stops.
 *
 * RANKING: cheap-index-first. Score each article by case-insensitive token
 * overlap (stopwords removed) between the question and the article's
 * title+description+category+cluster+section titles, and separately score each
 * section title. Take the top articles by article score, fetch at most 2 of
 * them, and within each pick the highest-scoring section, extracting a snippet
 * around the first question token that appears in the section text.
 */
const find_doodle_answer: WebMcpToolDef = {
  name: "find_doodle_answer",
  description:
    "Find where a question is answered across all Doodle AI articles. Returns the best-matching article SECTIONS (not whole articles): each gives the article title, section title, section slug, url, and a short relevant snippet, plus the exact read_article_section call to read it in full. Read-only. Params: 'question' (required, free text) and 'limit' (1-3, default 2). Use this to locate a section, then read_article_section to read it.",
  inputSchema: {
    type: "object",
    properties: {
      question: {
        type: "string",
        description:
          "The question or topic to find, in plain words (e.g. 'how many credits does a sticker sheet cost').",
      },
      limit: {
        type: "integer",
        description: "Max matching sections to return, 1-3. Defaults to 2.",
        minimum: 1,
        maximum: 3,
      },
    },
    required: ["question"],
  },
  annotations: {
    readOnlyHint: true,
    untrustedContentHint: true,
  },
  execute: async (args, context) => {
    const question = strArg(args.question);
    if (!question) {
      return cap('Missing "question". Pass a plain-text question, e.g. "how do I make a cartoon pet portrait".');
    }
    const limit = intArg(args.limit, 2, 1, 3);
    const qTokens = tokenize(question);
    if (qTokens.length === 0) {
      return cap(`"${clip(question, 60)}" has no searchable words. Try naming a topic, e.g. "sticker sheet credits" or "profile picture".`);
    }
    const qSet = new Set(qTokens);

    // Fetch 1 of at most 3: the cheap index.
    const { articles, error } = await loadIndex(context?.signal);
    if (error) return cap(error);
    if (!articles || articles.length === 0) {
      return cap("No Doodle AI articles are available right now.");
    }

    // Score every article against the question, cheaply (no bodies fetched).
    const overlap = (text: string): number => {
      let n = 0;
      for (const t of new Set(tokenize(text))) if (qSet.has(t)) n++;
      return n;
    };

    type Scored = {
      art: IndexArticle;
      artScore: number;
      bestSection?: IndexSection;
      sectionScore: number;
    };
    const scored: Scored[] = articles.map((art) => {
      const meta = `${art.title} ${art.description} ${art.category} ${art.cluster}`;
      let artScore = overlap(meta);
      let bestSection: IndexSection | undefined;
      let sectionScore = 0;
      for (const s of art.sections ?? []) {
        const sScore = overlap(s.title);
        // A section-title match is a strong within-article signal.
        artScore += sScore;
        if (sScore > sectionScore) {
          sectionScore = sScore;
          bestSection = s;
        }
      }
      return { art, artScore, bestSection, sectionScore };
    });

    const ranked = scored
      .filter((s) => s.artScore > 0)
      .sort((a, b) => b.artScore - a.artScore || b.sectionScore - a.sectionScore);

    if (ranked.length === 0) {
      return cap(`Nothing matched "${clip(question, 60)}". Call list_doodle_topics to see the categories and clusters, then try a keyword from one.`);
    }

    // We return `limit` sections and fetch AT MOST 2 full articles for snippets.
    const FETCH_CAP = 2;
    const want = ranked.slice(0, limit);

    // Budget: header + N section blocks. Reserve for a trailing hint.
    const RESERVE = 120;
    const perItem = Math.floor((HARD_CAP - RESERVE) / want.length);

    const blocks: string[] = [];
    let fetches = 0;

    for (const s of want) {
      if (context?.signal?.aborted) return cap(ABORT);

      const art = s.art;
      let sectionTitle = s.bestSection?.title ?? "";
      let sectionSlug = s.bestSection?.slug ?? "";
      let snippet = "";

      // Only fetch a body while we are under the 2-article fetch cap.
      if (fetches < FETCH_CAP) {
        const path = sameOriginPath(art.url);
        if (path) {
          const { article } = await loadArticle(path, context?.signal);
          fetches++;
          if (article?.sections && article.sections.length > 0) {
            // Pick the section whose title best matches; fall back to index pick.
            let best: FullSection | undefined;
            let bestScore = -1;
            for (const fs of article.sections) {
              const sc = overlap(fs.title) * 3 + overlap(fs.text);
              if (sc > bestScore) {
                bestScore = sc;
                best = fs;
              }
            }
            if (best) {
              sectionTitle = best.title;
              sectionSlug = best.slug;
              // Snippet: window around the first question token in the body.
              snippet = snippetAround(best.text, qTokens);
            }
          }
        }
      }

      const header = `${clip(art.title, 90)} › ${clip(sectionTitle || "(section)", 70)}`;
      const call = sectionSlug
        ? `read_article_section(url="${art.url}", section="${sectionSlug}")`
        : `list_article_sections(url="${art.url}")`;
      const bodyBudget = Math.max(
        0,
        perItem - header.length - call.length - art.url.length - 8,
      );
      const snip = snippet && bodyBudget > 0 ? `\n${clip(snippet, Math.min(bodyBudget, 260))}` : "";
      blocks.push(`${header}\n${art.url}${snip}\n→ ${call}`);
    }

    let out = `Best matches for "${clip(question, 60)}":\n\n${blocks.join("\n\n")}`;

    // Safety net: drop blocks until we fit, then final hard clamp.
    while (out.length > HARD_CAP - 40 && blocks.length > 1) {
      blocks.pop();
      out = `Best matches for "${clip(question, 60)}":\n\n${blocks.join("\n\n")}`;
    }
    return cap(out);
  },
};

/**
 * Extract a short readable window from `text` centred on the first question
 * token that appears in it. Falls back to the head of the text when no token
 * is found. Never returns more than ~260 chars (the caller clamps again).
 */
function snippetAround(text: string, qTokens: string[]): string {
  const clean = String(text ?? "").replace(/\s+/g, " ").trim();
  if (!clean) return "";
  const lower = clean.toLowerCase();
  let at = -1;
  for (const t of qTokens) {
    const idx = lower.indexOf(t);
    if (idx !== -1 && (at === -1 || idx < at)) at = idx;
  }
  if (at === -1) return clip(clean, 240);
  const start = Math.max(0, at - 80);
  const window = clean.slice(start, start + 240);
  return `${start > 0 ? "…" : ""}${window}`;
}

/* =========================================================================
 * Tool 2 — list_doodle_topics
 * ========================================================================= */

/**
 * Makes the taxonomy navigable. No required params. Returns the categories and
 * clusters actually present in the index, with an article count and one example
 * url per group, so an agent can orient before searching.
 *
 * First-party structural metadata → `untrustedContentHint: false`.
 * One network fetch (the cheap index) worst case.
 */
const list_doodle_topics: WebMcpToolDef = {
  name: "list_doodle_topics",
  description:
    "List Doodle AI's content taxonomy so you can orient before searching. Returns each category (guide, explainer, prompts, studios) and each cluster (cartoon, pets, stickers, gifts, social, studios) with the number of articles in it and one example url. Read-only, no params. Follow with find_doodle_answer to search, or list_doodle_articles to browse.",
  inputSchema: {
    type: "object",
    properties: {},
    required: [],
  },
  annotations: {
    readOnlyHint: true,
    untrustedContentHint: false,
  },
  execute: async (_args, context) => {
    const { articles, error } = await loadIndex(context?.signal);
    if (error) return cap(error);
    if (!articles || articles.length === 0) {
      return cap("No Doodle AI articles are available right now.");
    }

    type Group = { count: number; example: string };
    const cats = new Map<string, Group>();
    const clusters = new Map<string, Group>();

    for (const a of articles) {
      const cat = a.category || "other";
      const clu = a.cluster || "other";
      const c = cats.get(cat);
      if (c) c.count++;
      else cats.set(cat, { count: 1, example: a.url });
      const g = clusters.get(clu);
      if (g) g.count++;
      else clusters.set(clu, { count: 1, example: a.url });
    }

    const fmt = (m: Map<string, Group>): string =>
      [...m.entries()]
        .sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0]))
        .map(([name, g]) => `• ${name} (${g.count}) e.g. ${g.example}`)
        .join("\n");

    const out =
      `Doodle AI has ${articles.length} articles.\n\n` +
      `CATEGORIES\n${fmt(cats)}\n\n` +
      `CLUSTERS\n${fmt(clusters)}\n\n` +
      `Next: find_doodle_answer(question=…) to search, or list_doodle_articles to browse.`;
    return cap(out);
  },
};

/* =========================================================================
 * Tool 3 — get_article_faq
 * ========================================================================= */

/**
 * Returns one article's FAQ Q/A pairs, paginated if they would exceed the
 * budget. Only 2 of 10 articles have FAQ frontmatter, so the no-FAQ path is the
 * COMMON case: it says plainly there is no FAQ and points at list_article_sections.
 *
 * One full-article fetch worst case. Editorial answer text →
 * `untrustedContentHint: true`.
 */
const get_article_faq: WebMcpToolDef = {
  name: "get_article_faq",
  description:
    "Get one Doodle AI article's FAQ (question/answer pairs). Pass 'url' — an article path (e.g. /photo-to-sticker/). Most articles have no FAQ; when so, this says there is none and points you at list_article_sections for that url instead. Paginated with 'page' (1-based) if answers are long. Read-only. Call list_doodle_topics or list_doodle_articles first to get a url.",
  inputSchema: {
    type: "object",
    properties: {
      url: {
        type: "string",
        description: "The article path or URL whose FAQ you want (e.g. /photo-to-sticker/).",
      },
      page: {
        type: "integer",
        description: "1-based page when the FAQ is long. Defaults to 1.",
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
    const raw = strArg(args.url);
    if (!raw) {
      return cap('Missing "url". Call list_doodle_topics or list_doodle_articles first, then pass an article url.');
    }
    const path = sameOriginPath(raw);
    if (!path) {
      return cap(`"${clip(raw, 80)}" is not a Doodle AI article path. Call list_doodle_articles first.`);
    }
    const page = intArg(args.page, 1, 1, 999);

    const { article, error } = await loadArticle(path, context?.signal);
    if (error) return cap(error);

    const faq = Array.isArray(article?.faq) ? article!.faq : [];
    if (faq.length === 0) {
      return cap(
        `No FAQ for "${clip(path, 80)}" — most Doodle AI articles have none. ` +
          `Call list_article_sections(url="${path}") to see its section outline instead, ` +
          `or read_article_section to read a specific part.`,
      );
    }

    // Paginate: fill a page with whole Q/A pairs up to the budget.
    const RESERVE = 90;
    const budget = HARD_CAP - RESERVE;
    const pages: string[][] = [];
    let cur: string[] = [];
    let curLen = 0;
    for (const f of faq) {
      const block = `Q: ${clip(f.question, 160)}\nA: ${clip(f.answer, 600)}`;
      const add = block.length + 2;
      if (cur.length > 0 && curLen + add > budget) {
        pages.push(cur);
        cur = [];
        curLen = 0;
      }
      cur.push(block);
      curLen += add;
    }
    if (cur.length > 0) pages.push(cur);

    const total = pages.length;
    const idx = Math.min(page, total) - 1;
    const body = pages[idx].join("\n\n");
    const nav =
      total > 1
        ? `\n\n[FAQ page ${idx + 1} of ${total}${idx + 1 < total ? ` — get_article_faq(url="${path}", page=${idx + 2}) for more` : ""}]`
        : "";
    return cap(`FAQ — ${clip(article?.title ?? path, 90)}\n\n${body}${nav}`);
  },
};

/* =========================================================================
 * Tool 4 — get_prompt_pack
 * ========================================================================= */

/** The canonical prompt-library url (category `prompts`). */
const PROMPT_LIBRARY_URL = "/ai-cartoon-generator/prompts/";

/**
 * Surfaces concrete usable prompts from the `prompts`-category content, each as
 * a short labelled line. Optional 'topic' filters; optional 'limit' (1-5,
 * default 3). When nothing matches, names the prompt-library url so the agent
 * can read it directly.
 *
 * One index fetch + at most one prompt-article fetch = 2 fetches worst case.
 * Prompt lines are editorial → `untrustedContentHint: true`.
 */
const get_prompt_pack: WebMcpToolDef = {
  name: "get_prompt_pack",
  description:
    "Get concrete, usable Doodle AI prompts from the prompt library, each as a short labelled line. Optional 'topic' filters by keyword (e.g. 'sticker', 'pet', 'gift'); optional 'limit' (1-5, default 3). Read-only. When nothing matches it names the prompt-library url to read directly. These are example prompts to type into the chat composer — generation still requires a human to press send.",
  inputSchema: {
    type: "object",
    properties: {
      topic: {
        type: "string",
        description: "Optional keyword to filter prompts (e.g. 'sticker', 'pet portrait', 'gift'). Omit for a general sample.",
      },
      limit: {
        type: "integer",
        description: "Max prompts to return, 1-5. Defaults to 3.",
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
    const topic = strArg(args.topic);
    const topicTokens = tokenize(topic);
    const limit = intArg(args.limit, 3, 1, 5);

    // Fetch 1: locate the prompts-category article(s) in the cheap index.
    const { articles, error } = await loadIndex(context?.signal);
    if (error) return cap(error);

    const promptArticles = (articles ?? []).filter((a) => a.category === "prompts");
    const libUrl = promptArticles[0]?.url ?? PROMPT_LIBRARY_URL;

    if (promptArticles.length === 0) {
      return cap(
        `No prompt library is indexed right now. Read it directly at ${PROMPT_LIBRARY_URL}.`,
      );
    }

    // Fetch 2: the prompt library body, to pull concrete prompt lines from it.
    const path = sameOriginPath(libUrl);
    if (!path) {
      return cap(`Read the prompt library directly at ${libUrl}.`);
    }
    const { article } = await loadArticle(path, context?.signal);
    if (!article?.sections || article.sections.length === 0) {
      return cap(`Could not extract prompts right now. Read the library directly at ${libUrl}.`);
    }

    // Extract candidate prompt lines: bold-labelled patterns, quoted lines, or
    // list-style directives from the section text. Fall back to section leads.
    const prompts: { label: string; text: string }[] = [];
    for (const s of article.sections) {
      if (context?.signal?.aborted) return cap(ABORT);
      const label = clip(s.title, 60);
      // Split the section into sentence-ish candidates and keep imperative /
      // pattern-like ones (contain "prompt", a colon, or start with a verb).
      const clean = s.text.replace(/\s+/g, " ").trim();
      const candidates = clean
        .split(/(?<=[.!?])\s+|(?:^|\s)[-•]\s+/)
        .map((c) => c.trim())
        .filter((c) => c.length >= 24 && c.length <= 220);
      const pick = candidates.find((c) =>
        /prompt|pattern|attach|name (?:one|the)|write|type|ask for|request/i.test(c),
      );
      if (pick) prompts.push({ label, text: pick });
      if (prompts.length >= 12) break; // hard bound on scanning work
    }

    // Filter by topic if given (match against label + text).
    let filtered = prompts;
    if (topicTokens.length > 0) {
      const tset = new Set(topicTokens);
      filtered = prompts.filter((p) => {
        const toks = new Set(tokenize(`${p.label} ${p.text}`));
        for (const t of tset) if (toks.has(t)) return true;
        return false;
      });
    }

    if (filtered.length === 0) {
      const suffix = topic ? ` for "${clip(topic, 40)}"` : "";
      return cap(
        `No prompt matched${suffix}. Read the full prompt library at ${libUrl} (it maps prompts to live skills).`,
      );
    }

    const selected = filtered.slice(0, limit);
    const RESERVE = 120;
    const perItem = Math.floor((HARD_CAP - RESERVE) / selected.length);
    const lines = selected.map((p, i) => {
      const head = `${i + 1}. [${p.label}] `;
      return `${head}${clip(p.text, Math.max(0, perItem - head.length))}`;
    });

    let out =
      `Prompts from the Doodle AI library${topic ? ` matching "${clip(topic, 40)}"` : ""}:\n\n` +
      `${lines.join("\n\n")}\n\n` +
      `Type one into the chat composer; a human presses send. Full library: ${libUrl}`;

    while (out.length > HARD_CAP - 40 && lines.length > 1) {
      lines.pop();
      out =
        `Prompts from the Doodle AI library${topic ? ` matching "${clip(topic, 40)}"` : ""}:\n\n` +
        `${lines.join("\n\n")}\n\n` +
        `Type one into the chat composer; a human presses send. Full library: ${libUrl}`;
    }
    return cap(out);
  },
};

/* ---------------------------------------------------------------- bundle -- */

const bundle: ToolBundle = {
  id: "discovery",
  appliesTo: always,
  tools: [find_doodle_answer, list_doodle_topics, get_article_faq, get_prompt_pack],
};

export default bundle;
