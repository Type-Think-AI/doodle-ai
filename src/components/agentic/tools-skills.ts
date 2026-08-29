/**
 * WebMCP tools — skill guidance and comparison for Doodle AI.
 *
 * Agents can already LIST skills and read one-line metadata via
 * `list_doodle_skills` / `get_doodle_skill` (WebMcpTools.astro), but they cannot
 * read a skill's actual guidance or weigh two skills against each other — which
 * is exactly what someone choosing a visual style needs. This lane adds:
 *
 *   1. get_doodle_skill_guide  — paginated readable prose from a skill's SKILL.md
 *      body (what the style produces, what input works, what to expect).
 *   2. compare_doodle_skills   — a compact side-by-side of 2-4 skills.
 *
 * Both tools obey the shared lane contract (docs/webmcp-lane-brief.md):
 *   - `readOnlyHint: true`; `untrustedContentHint` is true for the guide (it
 *     returns editorial body text) and true for compare (its differentiating
 *     line is authored tagline copy);
 *   - `context.signal` is forwarded to every `fetch`, and `AbortError` returns a
 *     "…was cancelled." string;
 *   - they NEVER throw — every failure path returns a short guidance string that
 *     names the tool to call next;
 *   - same-origin only: URLs resolve against `window.location.origin` and
 *     off-origin input is refused;
 *   - output is capped BY CONSTRUCTION — `clip(text, HARD_CAP)` is the last thing
 *     applied to every return value, so no data shape can breach 1,500 chars.
 *
 * SAFETY — absolute: nothing here generates an image, uploads, or spends a
 * credit. Both tools are read-only. Generation stays reachable by navigation
 * only, so a human presses send.
 *
 * The bundle is route-scoped to `/skills` on purpose: a longer global tool list
 * measurably lowers agent tool-selection accuracy (Chrome's per-route guidance),
 * and skill guidance/comparison is only relevant on the skills surface.
 *
 * DATA SOURCES (chosen after checking for a cheaper same-origin source first):
 *   - The SKILL.md BODY has no JSON endpoint. `#webmcpSkills` (emitted at build
 *     time by WebMcpTools.astro) carries only metadata — id/name/tagline/url/
 *     requiresPhoto/aspectRatio/images, no prose. So the guide fetches the
 *     rendered public page `/skills/<id>/` same-origin and extracts its
 *     `.sk-doc-body` region with DOMParser, the same way tools-content.ts
 *     extracts `.article-body`. That region is the exact rendered SKILL.md file.
 *   - Comparison metadata (name, photo, aspect ratio, images, cost, tagline)
 *     is entirely in `#webmcpSkills`, so compare_doodle_skills makes NO network
 *     call at all — it reads that build-time script tag. Credit cost = images
 *     (1 credit per image), derived rather than duplicated.
 */
import { type ToolBundle, prefix } from './registry';
import type { WebMcpToolDef } from './tools-content';

/** Google's ceiling for a single tool output. Applied to every return value. */
const HARD_CAP = 1500;

/** One page of guidance stays comfortably under the ceiling. */
const PAGE_SIZE = 1500;

/**
 * The metadata shape WebMcpTools.astro serialises into `#webmcpSkills` at build
 * time. Only the fields this lane reads are declared. Kept in sync with that
 * file's `skillCatalogue`; a drift only means a missing field degrades to a
 * guidance string, never a throw.
 */
interface CatalogueSkill {
  id: string;
  name: string;
  tagline: string;
  url: string;
  requiresPhoto: boolean;
  aspectRatio: string;
  images: number;
}

/** Clip text to `max` chars on a word boundary, adding an ellipsis if cut. */
function clip(text: string, max: number): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const slice = t.slice(0, Math.max(0, max - 1));
  const lastSpace = slice.lastIndexOf(' ');
  return `${(lastSpace > max * 0.5 ? slice.slice(0, lastSpace) : slice).trimEnd()}…`;
}

/**
 * Read the build-time skill catalogue from the `#webmcpSkills` script tag.
 *
 * Same-origin, no network round trip, and it cannot disagree with the rendered
 * catalogue. Returns [] when the tag is absent (e.g. a page that did not include
 * WebMcpTools) so callers degrade to a guidance string.
 */
function readCatalogue(): CatalogueSkill[] {
  const node = document.getElementById('webmcpSkills');
  if (!node?.textContent) return [];
  try {
    const parsed = JSON.parse(node.textContent) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (s): s is CatalogueSkill => !!s && typeof (s as CatalogueSkill).id === 'string',
    );
  } catch {
    return [];
  }
}

/**
 * Extract the readable SKILL.md prose from a rendered skill page's HTML.
 *
 * Prefers the `.sk-doc-body` region (the rendered SKILL.md file in src/pages/
 * skills/[id].astro), then the `.sk-note` intro cards ("What you get back" /
 * "When the agent picks it") as a fallback, then `<main>`, so the page's nav,
 * hero, spec table and the sibling-skills rail are excluded. Uses DOMParser,
 * matching tools-content.ts's `extractArticleText`.
 */
function extractSkillGuide(html: string): string {
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const parts: string[] = [];

    const body = doc.querySelector('.sk-doc-body');
    if (body) {
      body.querySelectorAll('script, style, nav, footer, noscript, svg, form').forEach((n) => n.remove());
      const text = (body.textContent ?? '').replace(/\s+/g, ' ').trim();
      if (text) parts.push(text);
    }

    if (parts.length === 0) {
      // Fallback: the intro note cards, still real per-skill guidance.
      doc.querySelectorAll('.sk-note').forEach((note) => {
        const text = (note.textContent ?? '').replace(/\s+/g, ' ').trim();
        if (text) parts.push(text);
      });
    }

    if (parts.length === 0) {
      const main = doc.querySelector('main') ?? doc.body;
      if (main) {
        main.querySelectorAll('script, style, nav, footer, noscript, svg, form').forEach((n) => n.remove());
        const text = (main.textContent ?? '').replace(/\s+/g, ' ').trim();
        if (text) parts.push(text);
      }
    }

    return parts.join('\n\n');
  } catch {
    return '';
  }
}

/**
 * Cut a page-sized window out of `text` at `page` (1-based), preferring a
 * paragraph boundary near the end of the window so a window does not slice mid-
 * sentence. Returns the window text plus the byte offset the next page resumes
 * at, and the total page count.
 */
function paginate(text: string, page: number): { window: string; pageCount: number; nextStart: number } {
  const pageCount = Math.max(1, Math.ceil(text.length / PAGE_SIZE));
  const p = Math.min(Math.max(1, Math.trunc(page) || 1), pageCount);
  const start = (p - 1) * PAGE_SIZE;
  const hardEnd = Math.min(text.length, start + PAGE_SIZE);

  // Prefer to end on a paragraph/sentence boundary within the last third of the
  // window, so cuts fall between thoughts rather than mid-word.
  let end = hardEnd;
  if (hardEnd < text.length) {
    const tail = text.slice(start, hardEnd);
    const floor = Math.floor(PAGE_SIZE * 0.66);
    const paraBreak = tail.lastIndexOf('\n\n');
    const sentenceBreak = tail.lastIndexOf('. ');
    const cut = paraBreak >= floor ? paraBreak + 2 : sentenceBreak >= floor ? sentenceBreak + 2 : -1;
    if (cut > 0) end = start + cut;
  }

  return { window: text.slice(start, end).trim(), pageCount, nextStart: end };
}

/** Which page a byte offset falls on, for the "next call" hint. */
function pageOf(offset: number): number {
  return Math.floor(offset / PAGE_SIZE) + 1;
}

/**
 * Tool 1) get_doodle_skill_guide
 *
 * Required `id` (a skill id from list_doodle_skills), optional `page` (>=1).
 * Fetches /skills/<id>/, extracts the SKILL.md prose, and returns one
 * <=1500-char window on a paragraph boundary, stating `page N of M` and the
 * exact next call. Unknown id names list_doodle_skills.
 */
const get_doodle_skill_guide: WebMcpToolDef = {
  name: 'get_doodle_skill_guide',
  description:
    "Read the actual guidance for one Doodle AI skill: what the style produces, what input photo or description works well, and what to expect. Pass 'id' from list_doodle_skills. A skill's guide is long, so it is paginated — pass 'page' (default 1) and the reply states page N of M and the exact next call. Read-only; it never generates. Call list_doodle_skills first for a valid id.",
  inputSchema: {
    type: 'object',
    properties: {
      id: {
        type: 'string',
        description: 'Skill id exactly as returned by list_doodle_skills, e.g. "normal".',
      },
      page: {
        type: 'integer',
        description: 'Which 1500-char page of the guide to read, 1 or higher. Defaults to 1.',
        minimum: 1,
      },
    },
    required: ['id'],
  },
  annotations: {
    readOnlyHint: true,
    untrustedContentHint: true,
  },
  execute: async (args, context) => {
    const id = String((args as { id?: unknown }).id ?? '').trim();
    if (!id) return 'Missing "id". Call list_doodle_skills to get valid skill ids.';

    let page = 1;
    if (typeof (args as { page?: unknown }).page === 'number' && Number.isFinite((args as { page: number }).page)) {
      page = Math.max(1, Math.trunc((args as { page: number }).page));
    }

    // Resolve the page URL from the catalogue rather than interpolating the id
    // into a path, so an arbitrary string can never become a fetch target.
    const catalogue = readCatalogue();
    const match = catalogue.find((s) => s.id === id);
    if (!match) {
      if (catalogue.length === 0) {
        return 'Skill catalogue unavailable on this page. Call list_doodle_skills, or open /skills/.';
      }
      return `No skill with id "${clip(id, 60)}". Call list_doodle_skills first for valid ids.`;
    }

    let target: URL;
    try {
      target = new URL(match.url, window.location.origin);
    } catch {
      return `Could not resolve the page for "${clip(id, 60)}". Open /skills/ instead.`;
    }
    if (target.origin !== window.location.origin) {
      return `The page for "${clip(id, 60)}" is off-origin and was refused. Open /skills/ instead.`;
    }

    try {
      const res = await fetch(target.toString(), { signal: context?.signal });
      if (res.status === 404) {
        return `No skill page at "${clip(target.pathname, 80)}". Call list_doodle_skills first.`;
      }
      if (!res.ok) {
        return `Could not load the guide for "${match.name}" (HTTP ${res.status}). Try again shortly.`;
      }

      const html = await res.text();
      const text = extractSkillGuide(html);
      if (!text) {
        return `No readable guidance found for "${match.name}". Open ${target.toString()} to read it.`;
      }

      const { window: win, pageCount, nextStart } = paginate(text, page);
      const requested = Math.min(Math.max(1, page), pageCount);
      const header = `${match.name} — guide, page ${requested} of ${pageCount}.`;

      let footer: string;
      if (nextStart < text.length) {
        const nextPage = pageOf(nextStart);
        footer = `More: call get_doodle_skill_guide with id="${match.id}", page=${nextPage}.`;
      } else {
        footer = `End of guide. Full page: ${target.toString()}`;
      }

      // Budget the body so header + body + footer stays under HARD_CAP; clip is
      // the last thing applied so the ceiling holds regardless of the data.
      const overhead = header.length + footer.length + 4; // 2 blank-line joins
      const bodyBudget = Math.max(0, HARD_CAP - overhead);
      const body = clip(win, bodyBudget);
      return clip(`${header}\n\n${body}\n\n${footer}`, HARD_CAP);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return 'Reading the skill guide was cancelled.';
      }
      return `Could not read the guide for "${match.name}" right now. Try again shortly.`;
    }
  },
};

/** Parse the `ids` param into a clean id list: accept an array OR a comma string. */
function parseIds(raw: unknown): string[] {
  let list: string[];
  if (Array.isArray(raw)) {
    list = raw.map((v) => String(v ?? '').trim());
  } else if (typeof raw === 'string') {
    list = raw.split(',').map((v) => v.trim());
  } else {
    list = [];
  }
  return list.filter((v) => v.length > 0);
}

/**
 * Tool 2) compare_doodle_skills
 *
 * Required `ids` — an array of 2-4 skill ids (a comma-separated string is also
 * accepted, since some agents flatten arrays). Returns a compact side-by-side of
 * name, photo required, aspect ratio, images returned, credit cost, and one
 * differentiating line each, ending with each page URL. Unknown or duplicate ids
 * are reported WITHOUT failing the whole call.
 */
const compare_doodle_skills: WebMcpToolDef = {
  name: 'compare_doodle_skills',
  description:
    "Compare 2-4 Doodle AI skills side by side: name, whether a photo is required, output aspect ratio, images returned, credit cost, and one differentiating line each, ending with each page URL. Pass 'ids' as an array of skill ids from list_doodle_skills (a comma-separated string also works). Read-only; unknown or duplicate ids are named, not fatal. Call list_doodle_skills first for valid ids.",
  inputSchema: {
    type: 'object',
    properties: {
      ids: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Two to four skill ids from list_doodle_skills, e.g. ["normal","crayon"]. A comma-separated string is also accepted.',
        minItems: 2,
        maxItems: 4,
      },
    },
    required: ['ids'],
  },
  annotations: {
    readOnlyHint: true,
    untrustedContentHint: true,
  },
  execute: async (args) => {
    const requested = parseIds((args as { ids?: unknown }).ids);
    if (requested.length === 0) {
      return 'Missing "ids". Pass 2-4 skill ids from list_doodle_skills, e.g. ["normal","crayon"].';
    }

    const catalogue = readCatalogue();
    if (catalogue.length === 0) {
      return 'Skill catalogue unavailable on this page. Call list_doodle_skills, or open /skills/.';
    }

    // De-duplicate while preserving order; track which ids were dropped as dupes
    // and which are unknown — neither fails the call.
    const seen = new Set<string>();
    const duplicates: string[] = [];
    const unique: string[] = [];
    for (const id of requested) {
      if (seen.has(id)) {
        if (!duplicates.includes(id)) duplicates.push(id);
        continue;
      }
      seen.add(id);
      unique.push(id);
    }

    const valid: CatalogueSkill[] = [];
    const unknown: string[] = [];
    for (const id of unique) {
      const match = catalogue.find((s) => s.id === id);
      if (match) valid.push(match);
      else unknown.push(id);
    }

    if (valid.length === 0) {
      return `None of those ids match a skill (${clip(unknown.join(', '), 120)}). Call list_doodle_skills for valid ids.`;
    }

    // Reserve room for the notes about invalid ids so the block never gets
    // dropped by the final clamp; split the rest evenly across the valid skills.
    const notes: string[] = [];
    if (unknown.length > 0) notes.push(`Not found: ${unknown.join(', ')}.`);
    if (duplicates.length > 0) notes.push(`Duplicates ignored: ${duplicates.join(', ')}.`);
    const noteBlock = notes.length > 0 ? `\n\n${notes.join(' ')}` : '';

    const perSkill = Math.max(80, Math.floor((HARD_CAP - noteBlock.length - 20) / valid.length));

    const blocks = valid.map((s) => {
      const photo = s.requiresPhoto ? 'photo required' : 'no photo needed';
      const imgs = `${s.images} image${s.images === 1 ? '' : 's'}`;
      const cost = `${s.images} credit${s.images === 1 ? '' : 's'}`; // 1 credit per image
      const fixed = `${s.name} (${s.id})\n  ${photo} · ${s.aspectRatio} · ${imgs} · ${cost}\n  `;
      const taglineBudget = Math.max(0, perSkill - fixed.length - s.url.length - 12);
      const tagline = taglineBudget > 0 ? clip(s.tagline, Math.min(taglineBudget, 160)) : '';
      const line = tagline ? `${fixed}${tagline}\n  ${s.url}` : `${fixed.trimEnd()}\n  ${s.url}`;
      return clip(line, perSkill);
    });

    let out = `Comparing ${valid.length} skill${valid.length === 1 ? '' : 's'}:\n\n${blocks.join('\n\n')}${noteBlock}`;

    // Safety net: if construction still overshot, drop skills until it fits,
    // keeping the notes so invalid ids are still reported.
    while (out.length > HARD_CAP - 40 && blocks.length > 1) {
      blocks.pop();
      out = `Comparing ${blocks.length} of ${valid.length} skills (rest omitted for length):\n\n${blocks.join('\n\n')}${noteBlock}`;
    }

    return clip(out, HARD_CAP);
  },
};

/**
 * Route-scoped to /skills — skill guidance and comparison are only relevant on
 * the skills surface, and a shorter per-route tool list improves agent
 * tool-selection accuracy. `prefix('/skills')` covers the /skills/ index and
 * every /skills/<id> page.
 */
const bundle: ToolBundle = {
  id: 'skills',
  appliesTo: prefix('/skills'),
  tools: [get_doodle_skill_guide, compare_doodle_skills],
};

export default bundle;
