/**
 * Shared, pure article-parsing helpers for the two agent content endpoints:
 *
 *   GET /api/agent/articles.json   (cheap index, section outline only)
 *   GET /api/agent/article.json    (one article, full section bodies)
 *
 * Everything an endpoint needs to turn a raw markdown body into readable,
 * navigable sections lives here as pure exported functions, so both routes
 * share ONE implementation and it is unit-testable without a running server.
 * The route files stay thin: read the collection, call `splitIntoSections`,
 * serialise, cap the headers.
 *
 * ── Why the slug logic is vendored, not hand-rolled ──
 *
 * The `slug` field on every section MUST equal the anchor id Astro emits for
 * that heading, so an agent's section list agrees with the on-page table of
 * contents and `article.json?path=…#slug` scrolls to the right place. Astro
 * generates those ids with `github-slugger` (imported inside
 * `astro/dist/content/utils.js`), which lowercases, deletes a large unicode
 * punctuation class, turns spaces into hyphens, and de-duplicates collisions
 * with a numeric suffix. `github-slugger` is only a *transitive* dependency
 * here and not declared in package.json, so importing it directly would be a
 * resolution gamble at build time. Instead the exact 2.0.0 algorithm — the
 * generated punctuation regex and the `slug()` + collision loop — is vendored
 * below. It has been verified byte-for-byte against the live rendered heading
 * ids (e.g. "…before/after" -> "…beforeafter", the slash deleted not
 * hyphenated; "Save, download, and share" -> "save-download-and-share").
 *
 * If Astro ever swaps its slugger, the divergence surfaces as a section whose
 * `slug` no longer matches the page anchor — re-verify against the rendered HTML
 * and check which slugger the new rehype plugin uses, then align the
 * `github-slugger` version pinned in package.json to match it.
 */

import { slug } from "github-slugger";

/* -------------------------------------------------------------------------- */
/* Slug — github-slugger@2.0.0, the package Astro's rehype-slug already uses    */
/* -------------------------------------------------------------------------- */

/**
 * The stateless github-slugger `slug()`: lowercase, delete the punctuation
 * class, spaces -> hyphens. Same value every call (no dedupe). Use `Slugger`
 * below when you need collision-suffixed ids for a whole document.
 *
 * This used to be a hand-copy of the package: an 8,173-character character class
 * vendored from `github-slugger/regex.js` plus a reimplementation of its
 * collision logic. That copy cost three `eslint-disable` rules (the control
 * characters, escapes and combined characters are upstream's, and hand-editing
 * them would have silently changed every heading anchor on the site) and it
 * carried a standing drift risk: nothing checked it still matched the version
 * rehype-slug actually runs.
 *
 * Importing the package removes all of that. `github-slugger@2.0.0` is pinned to
 * the exact version the copy was taken from, was already present in the
 * dependency tree via rehype-slug, and is pure JS with no Node builtins — so it
 * bundles into the Cloudflare Worker unchanged.
 */
export function slugify(value: string): string {
  return slug(value);
}

/**
 * Stateful slugger matching github-slugger's collision behaviour: a repeated
 * base slug gets `-1`, `-2`, … in document order. Astro feeds ALL heading
 * depths through one instance per page, so to reproduce its ids exactly we
 * must slug every emitted heading (h2 AND h3) through one `Slugger` in the
 * order they appear in the body.
 */
export class Slugger {
  private occurrences: Record<string, number> = Object.create(null);

  slug(value: string): string {
    const base = slugify(value);
    let result = base;
    while (result in this.occurrences) {
      this.occurrences[base] += 1;
      result = `${base}-${this.occurrences[base]}`;
    }
    this.occurrences[result] = 0;
    return result;
  }
}

/* -------------------------------------------------------------------------- */
/* Markdown -> readable plain text                                             */
/* -------------------------------------------------------------------------- */

/**
 * Strip inline markdown from a single line/run of text, leaving readable
 * plain text: images removed, links reduced to their label, emphasis / code
 * ticks / heading markers dropped. Whitespace is NOT collapsed here so callers
 * can compose it; use `toPlainText` for the whitespace-collapsed form.
 */
function stripInline(text: string): string {
  return (
    text
      // images ![alt](url) -> nothing (alt text is decorative here)
      .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
      // inline links [label](url) -> label
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      // reference links [label][ref] -> label
      .replace(/\[([^\]]*)\]\[[^\]]*\]/g, "$1")
      // bare autolinks <https://…> -> the url text
      .replace(/<((?:https?|mailto):[^>]+)>/g, "$1")
      // inline code `code` -> code
      .replace(/`+([^`]*)`+/g, "$1")
      // bold/italic/strikethrough markers ** __ * _ ~~
      .replace(/(\*\*|__|~~|\*|_)/g, "")
      // leftover escaping backslashes before punctuation
      .replace(/\\([\\`*_{}[\]()#+\-.!~>|])/g, "$1")
  );
}

/**
 * Turn a raw markdown block (one section body, possibly many lines) into
 * readable plain text:
 *
 *   - fenced ``` code blocks: keep the code lines, drop the fences;
 *   - ATX headings: drop the leading `#`s (a section body never contains its
 *     own heading, but nested `###` inside a `##` section is flattened to its
 *     text so no content is lost);
 *   - blockquote `>` markers, list bullets `- * +`, ordered `1.`, and table
 *     pipe borders/separators: reduced to their text;
 *   - inline markdown stripped via `stripInline`;
 *   - all whitespace runs collapsed to single spaces, trimmed.
 *
 * Deliberately a forgiving transformer, not a full CommonMark parser: it only
 * has to yield text an agent can read and that round-trips to a stable char
 * count. It never throws.
 */
export function toPlainText(markdown: string): string {
  if (!markdown) return "";

  const lines = markdown.split("\n");
  const out: string[] = [];
  let inFence = false;

  for (const raw of lines) {
    const line = raw;
    const fenceMatch = /^\s*(```|~~~)/.test(line);
    if (fenceMatch) {
      inFence = !inFence;
      continue; // drop the fence line itself
    }
    if (inFence) {
      out.push(line); // keep code verbatim
      continue;
    }

    let s = line;
    // Strip leading block markers.
    s = s.replace(/^\s{0,3}#{1,6}\s+/, ""); // heading -> text
    s = s.replace(/^\s{0,3}>\s?/, ""); // blockquote
    s = s.replace(/^\s*([-*+]|\d+[.)])\s+/, ""); // list marker
    // Table rows: a separator row (|---|:--:|) carries no prose; drop it.
    if (/^\s*\|?[\s:|-]+\|?\s*$/.test(s) && /-/.test(s)) {
      continue;
    }
    // Table content rows: turn cell borders into spaces.
    if (/\|/.test(s)) {
      s = s.replace(/^\s*\|/, "").replace(/\|\s*$/, "").replace(/\s*\|\s*/g, " ");
    }
    // Horizontal rules carry no text.
    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) continue;

    out.push(stripInline(s));
  }

  return out.join(" ").replace(/\s+/g, " ").trim();
}

/**
 * Word count over the readable plain text of a whole body. Used for the
 * `wordCount` field; kept here so both endpoints agree on the number.
 */
export function countWords(markdown: string): number {
  const text = toPlainText(markdown);
  if (!text) return 0;
  return text.split(/\s+/).filter(Boolean).length;
}

/* -------------------------------------------------------------------------- */
/* Section splitting                                                           */
/* -------------------------------------------------------------------------- */

/** One parsed section, in document order. */
export interface ArticleSection {
  /** Anchor slug, byte-identical to the on-page heading id. */
  slug: string;
  /** Heading text (plain), or "Introduction" for the pre-`##` lead. */
  title: string;
  /** Heading depth (2 for `##`, 3 for `###`, 0 for the intro lead). */
  depth: number;
  /** Zero-based position in the section list. */
  index: number;
  /** Character length of `text`. */
  chars: number;
  /** Readable plain text of everything under this heading up to the next. */
  text: string;
}

/**
 * A fenced-code-aware line classifier: is this line an ATX heading, and at
 * what depth? Returns null for non-headings and for `#` lines inside a code
 * fence (a comment like `# TODO` must not start a section).
 */
interface HeadingLine {
  depth: number;
  text: string;
}

function parseHeading(line: string): HeadingLine | null {
  const m = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
  if (!m) return null;
  return { depth: m[1].length, text: stripInline(m[2]).replace(/\s+/g, " ").trim() };
}

/**
 * Split a raw article body into sections at every `##` and `###` heading.
 *
 * Contract details that the endpoints and four other lanes rely on:
 *
 *   - Prose BEFORE the first `##`/`###` is emitted as a leading section with
 *     `slug: "introduction"`, `title: "Introduction"`, `depth: 0` — but ONLY
 *     if it contains readable text, so an article that opens straight on a
 *     heading gets no empty intro.
 *   - `slug` is assigned via one shared `Slugger` fed every heading in
 *     document order, so collision suffixes match Astro's page anchors. The
 *     synthetic `introduction` slug is claimed on the slugger first so a real
 *     `## Introduction` heading would correctly become `introduction-1`.
 *   - Each section's `text` is the plain-text render of its body, which for a
 *     `##` section INCLUDES any nested `###` prose flattened in (the `###`
 *     still also appears as its own addressable section — nothing is dropped,
 *     some is intentionally reachable two ways).
 *
 * Fenced code blocks are tracked so a `#` inside ``` does not split a section.
 * Never throws.
 */
export function splitIntoSections(body: string): ArticleSection[] {
  const slugger = new Slugger();
  const lines = (body ?? "").split("\n");

  // First pass: find heading boundaries (fence-aware).
  interface Boundary {
    line: number;
    depth: number;
    text: string;
  }
  const boundaries: Boundary[] = [];
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*(```|~~~)/.test(lines[i])) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const h = parseHeading(lines[i]);
    if (h && h.depth >= 2 && h.depth <= 3) {
      boundaries.push({ line: i, depth: h.depth, text: h.text });
    }
  }

  const sections: ArticleSection[] = [];

  // Leading lead-in: everything before the first section heading.
  const firstLine = boundaries.length ? boundaries[0].line : lines.length;
  const introRaw = lines.slice(0, firstLine).join("\n");
  const introText = toPlainText(introRaw);
  if (introText) {
    // Claim "introduction" on the slugger so a later "## Introduction" dedupes.
    const slug = slugger.slug("Introduction");
    sections.push({
      slug,
      title: "Introduction",
      depth: 0,
      index: 0,
      chars: introText.length,
      text: introText,
    });
  }

  // Each heading owns the body up to the next heading of ANY tracked depth.
  for (let b = 0; b < boundaries.length; b++) {
    const start = boundaries[b].line + 1;
    const end = b + 1 < boundaries.length ? boundaries[b + 1].line : lines.length;
    const bodyRaw = lines.slice(start, end).join("\n");
    const text = toPlainText(bodyRaw);
    // Slug is assigned for EVERY heading in order (matches Astro), even if the
    // section body is empty, so downstream indices/anchors stay aligned.
    const slug = slugger.slug(boundaries[b].text);
    sections.push({
      slug,
      title: boundaries[b].text,
      depth: boundaries[b].depth,
      index: sections.length,
      chars: text.length,
      text,
    });
  }

  return sections;
}
