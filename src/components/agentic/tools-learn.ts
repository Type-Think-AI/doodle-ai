/**
 * WebMCP tools — site map and /learn/ browsing for Doodle AI (Lane E).
 *
 * An agent embedded on a page can already SEARCH articles and LIST skills, but
 * the *shape* of the site — what pages exist, what each is for, which need
 * sign-in, which spend credits — is invisible to it. Without that map it cannot
 * orient or navigate deliberately. These two read-only tools supply it:
 *
 *   1. list_doodle_pages   — the site map an agent can act on, paginated so the
 *                            response always fits the WebMCP output ceiling.
 *   2. browse_doodle_learn — the /learn/ hub: category groupings with their
 *                            label, blurb, and the article titles + urls inside.
 *
 * Both:
 *   - are `readOnlyHint: true`; list_doodle_pages is first-party structural
 *     metadata (`untrustedContentHint: false`) while browse_doodle_learn returns
 *     editorial titles fetched from the article index (`untrustedContentHint: true`);
 *   - forward `context.signal` to every fetch and handle AbortError;
 *   - NEVER throw — every failure path returns a short, actionable guidance
 *     string naming the tool to call next;
 *   - keep output strictly under the 1,500-char ceiling BY CONSTRUCTION (see
 *     `HARD_CAP` and the per-item budgeting), never "return everything and hope".
 *
 * SELF-CONTAINED like tools-content.ts: it defines its own local helpers and
 * imports only the public `ToolBundle` / `always` and `EXCLUDED_PREFIXES` from
 * the registry. It does NOT import the server-only `articles.ts` (that pulls in
 * `astro:content`, which cannot run in the browser bundle these tools ship in);
 * the CATEGORY label/blurb text below is mirrored from that module's
 * `CATEGORY_LABEL` / `CATEGORY_BLURB` and kept identical so tool and page agree.
 */
import type { WebMcpToolDef } from './tools-content';
import { type ToolBundle, always, EXCLUDED_PREFIXES } from './registry';

/** Absolute WebMCP output ceiling. We stay safely under it. */
const HARD_CAP = 1500;

/** Clip text to `max` chars on a word boundary, adding an ellipsis if cut. */
function clip(text: string, max: number): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const slice = t.slice(0, Math.max(0, max - 1));
  const lastSpace = slice.lastIndexOf(' ');
  return `${(lastSpace > max * 0.5 ? slice.slice(0, lastSpace) : slice).trimEnd()}…`;
}

/** Build an absolute same-origin URL for a Lane-A article index endpoint. */
function toApiUrl(pathname: string): string {
  return new URL(pathname, window.location.origin).toString();
}

/* ============================================================ site map == */

/**
 * The site's page groupings, an agent's orientation surface.
 *
 * `area` values group routes by what a human uses them for: content (read),
 * product (the app itself), account (sign-in-gated personal state), legal.
 *
 * Every entry is a PUBLIC, non-excluded route. `/admin/**`, `/s/<token>` and
 * `/join/<token>` are deliberately absent and are additionally proven absent at
 * module load against EXCLUDED_PREFIXES (see the assertion below) so the map can
 * never advertise a staff or token surface even if this list is edited badly.
 *
 * `auth` marks a route that needs sign-in. `human` marks a route whose primary
 * action mutates account/workspace state or spends credits — an agent must
 * treat these as navigation targets for a human, never as actions it performs.
 */
type Area = 'content' | 'product' | 'account' | 'legal';

interface PageEntry {
  path: string;
  area: Area;
  /** One clause: what the page is for. */
  purpose: string;
  /** Sign-in required to use the page. */
  auth: boolean;
  /** Primary action mutates state or spends credits — human presses the button. */
  human: boolean;
}

/**
 * Verified from the lane brief's route inventory. `/privacy` and `/terms` are
 * 308 redirects, so only the canonical targets appear. Skill and article detail
 * pages are represented by their index/entry points rather than enumerated —
 * the agent reaches individual skills via list_doodle_skills and individual
 * articles via list_doodle_articles / browse_doodle_learn.
 */
const PAGES: PageEntry[] = [
  // ── content ──────────────────────────────────────────────────────────
  { path: '/learn/', area: 'content', purpose: 'hub linking every guide, explainer and prompt pack', auth: false, human: false },
  { path: '/skills/', area: 'content', purpose: 'index of the 22 runnable doodle skills', auth: false, human: false },
  { path: '/ai-cartoon-generator/prompts/', area: 'content', purpose: 'copyable prompt library for the cartoon skills', auth: false, human: false },
  { path: '/about', area: 'content', purpose: 'what Doodle AI is and who makes it', auth: false, human: false },
  { path: '/for-studios/', area: 'content', purpose: 'production workflows for studios and filmmakers', auth: false, human: false },
  { path: '/roadmap/', area: 'content', purpose: 'what is planned and shipping next', auth: false, human: false },
  { path: '/status', area: 'content', purpose: 'live service status', auth: false, human: false },
  // ── product ──────────────────────────────────────────────────────────
  { path: '/', area: 'product', purpose: 'chat composer — generation spends credits, a human must press send', auth: false, human: true },
  { path: '/characters', area: 'product', purpose: 'reusable characters for consistent doodles', auth: false, human: false },
  { path: '/moodboards', area: 'product', purpose: 'moodboard collections for style references', auth: false, human: false },
  { path: '/boards', area: 'product', purpose: 'your collaborative doodle boards', auth: true, human: false },
  { path: '/projects/', area: 'product', purpose: 'your saved projects', auth: true, human: false },
  // ── account (sign-in, mutating) ──────────────────────────────────────
  { path: '/settings', area: 'account', purpose: 'your account settings — human-only, changes account state', auth: true, human: true },
  { path: '/team/', area: 'account', purpose: 'your team — human-only, changes team membership', auth: true, human: true },
  { path: '/team/settings', area: 'account', purpose: 'team settings — human-only, changes team state', auth: true, human: true },
  // ── legal ────────────────────────────────────────────────────────────
  { path: '/privacy-policy', area: 'legal', purpose: 'privacy policy', auth: false, human: false },
  { path: '/terms-of-service', area: 'legal', purpose: 'terms of service', auth: false, human: false },
];

/**
 * Safety filter: an advertisable path can never start with an excluded prefix.
 *
 * The requirement is that `/admin/**`, `/s/<token>` and `/join/<token>` are
 * never advertised. This enforces it by REMOVING offenders rather than by
 * throwing at module load, which was the original implementation and is a
 * landmine in a browser bundle: this module is imported by the WebMCP
 * registration script, so a module-load throw would abort evaluation and take
 * *every* tool on the site down with it. The failure mode would be an empty
 * DevTools WebMCP panel — indistinguishable from the browser simply not having
 * the feature enabled, which is exactly the misdiagnosis that cost hours.
 *
 * Fail-safe, not fail-fast: the unsafe entry is dropped so nothing can leak,
 * and the mistake is reported to the console instead of breaking the page.
 * `EXCLUDED_PREFIXES` is imported from the registry so this cannot drift from
 * the source of truth.
 */
const EXCLUDED_ENTRIES = PAGES.filter((p) =>
  EXCLUDED_PREFIXES.some((prefix) => p.path.startsWith(prefix)),
);

const SAFE_PAGES: readonly PageEntry[] = PAGES.filter(
  (p) => !EXCLUDED_PREFIXES.some((prefix) => p.path.startsWith(prefix)),
);

if (EXCLUDED_ENTRIES.length > 0) {
  console.error(
    '[WebMCP] tools-learn dropped excluded route(s) from the site map:',
    EXCLUDED_ENTRIES.map((o) => o.path).join(', '),
  );
}

const AREAS: readonly Area[] = ['content', 'product', 'account', 'legal'];

function renderPageLine(p: PageEntry): string {
  const tags: string[] = [];
  if (p.auth) tags.push('sign-in');
  if (p.human) tags.push('human-only');
  const suffix = tags.length > 0 ? ` [${tags.join(', ')}]` : '';
  return `${p.path} — ${p.purpose}${suffix}`;
}

const list_doodle_pages: WebMcpToolDef = {
  name: 'list_doodle_pages',
  description:
    "Map the pages of Doodle AI so an agent can orient and navigate deliberately. Read-only. Each line gives the path, a one-clause purpose, and whether sign-in is required; account-changing pages and the '/' composer (which spends credits) are marked human-only — navigate a human there, do not act. Optional 'area' (content|product|account|legal) filters the map. 'limit' 1-8 (default 6) and 'offset' paginate; the response states the total and the next call.",
  inputSchema: {
    type: 'object',
    properties: {
      area: {
        type: 'string',
        description:
          'Filter to one group: content (read), product (the app), account (sign-in personal state), legal. Omit for all.',
        enum: ['content', 'product', 'account', 'legal'],
      },
      limit: {
        type: 'integer',
        description: 'Max pages to return, 1-8. Defaults to 6.',
        minimum: 1,
        maximum: 8,
      },
      offset: {
        type: 'integer',
        description: 'Skip this many pages before returning (for pagination). Defaults to 0.',
        minimum: 0,
      },
    },
    required: [],
  },
  annotations: {
    readOnlyHint: true,
    // First-party structural metadata authored here, not fetched editorial text.
    untrustedContentHint: false,
  },
  execute: async (args) => {
    try {
      const area =
        typeof args.area === 'string' && (AREAS as readonly string[]).includes(args.area)
          ? (args.area as Area)
          : undefined;

      let limit = 6;
      if (typeof args.limit === 'number' && Number.isFinite(args.limit)) {
        limit = Math.min(8, Math.max(1, Math.floor(args.limit)));
      }
      let offset = 0;
      if (typeof args.offset === 'number' && Number.isFinite(args.offset)) {
        offset = Math.max(0, Math.floor(args.offset));
      }

      const filtered = area ? SAFE_PAGES.filter((p) => p.area === area) : SAFE_PAGES;
      const total = filtered.length;

      if (total === 0) {
        return `No pages in area "${area}". Call list_doodle_pages with no area to see every group.`;
      }
      if (offset >= total) {
        return `Offset ${offset} is past the end (${total} page(s)${area ? ` in ${area}` : ''}). Call list_doodle_pages with offset 0.`;
      }

      const page = filtered.slice(offset, offset + limit);
      const scope = area ? `${area} page(s)` : 'page(s)';
      const header = `${total} ${scope}. Showing ${offset + 1}-${offset + page.length}:`;
      const lines = page.map(renderPageLine);

      let out = `${header}\n\n${lines.join('\n')}`;

      const nextOffset = offset + page.length;
      if (nextOffset < total) {
        out += `\n\nNext: list_doodle_pages { ${area ? `area: "${area}", ` : ''}offset: ${nextOffset} } for ${total - nextOffset} more.`;
      }

      // Safety net: if the concrete data ever grew past budget, drop lines to fit.
      while (out.length > HARD_CAP - 40 && lines.length > 1) {
        lines.pop();
        const shown = `${offset + 1}-${offset + lines.length}`;
        out = `${total} ${scope}. Showing ${shown}:\n\n${lines.join('\n')}\n\nNext: list_doodle_pages { ${area ? `area: "${area}", ` : ''}offset: ${offset + lines.length} } for the rest.`;
      }

      return clip(out, HARD_CAP);
    } catch {
      return 'Could not build the page map right now. Try again shortly.';
    }
  },
};

/* =========================================================== /learn/ hub == */

/**
 * Category label + blurb text, MIRRORED from src/lib/content/articles.ts
 * (CATEGORY_LABEL / CATEGORY_BLURB, in CATEGORY_ORDER). Kept identical so this
 * tool and the /learn/ page describe the categories the same way. If those
 * constants change, update these — they cannot be imported here because that
 * module pulls in `astro:content`, which does not run in the browser bundle.
 */
const LEARN_CATEGORIES = [
  { category: 'guide', label: 'Guide', blurb: 'Step-by-step processes for one photo and one result.' },
  { category: 'explainer', label: 'Explainer', blurb: 'What a term actually means, and which job you have.' },
  { category: 'prompts', label: 'Prompts', blurb: 'Copyable prompt patterns for the runnable skills.' },
  { category: 'studios', label: 'For studios', blurb: 'Production workflows for studios and filmmakers.' },
] as const;

type LearnCategory = (typeof LEARN_CATEGORIES)[number]['category'];

/** Shape of an entry in Lane A's /api/agent/articles.json (frozen contract). */
interface AgentArticle {
  url: string;
  title: string;
  category: string;
}

const browse_doodle_learn: WebMcpToolDef = {
  name: 'browse_doodle_learn',
  description:
    "Browse the /learn/ hub: Doodle AI's editorial content grouped by category (guide, explainer, prompts, studios), each with its label, blurb, and the article titles + urls inside it. Read-only. Optional 'category' shows just one group; omit it to see all. Ends with a pointer to list_doodle_articles for the full paginated inventory. Use this to see the shape of the content, then read a body with get_doodle_article.",
  inputSchema: {
    type: 'object',
    properties: {
      category: {
        type: 'string',
        description:
          'Show one category only: guide, explainer, prompts, or studios. Omit to see every category.',
        enum: ['guide', 'explainer', 'prompts', 'studios'],
      },
      limit: {
        type: 'integer',
        description: 'Max article titles to list per category, 1-5. Defaults to 4.',
        minimum: 1,
        maximum: 5,
      },
    },
    required: [],
  },
  annotations: {
    readOnlyHint: true,
    // Returns editorial titles fetched from the article index.
    untrustedContentHint: true,
  },
  execute: async (args, context) => {
    try {
      const category =
        typeof args.category === 'string' &&
        LEARN_CATEGORIES.some((c) => c.category === args.category)
          ? (args.category as LearnCategory)
          : undefined;

      let limit = 4;
      if (typeof args.limit === 'number' && Number.isFinite(args.limit)) {
        limit = Math.min(5, Math.max(1, Math.floor(args.limit)));
      }

      const res = await fetch(toApiUrl('/api/agent/articles.json'), {
        signal: context?.signal,
      });
      if (!res.ok) {
        return `Could not load the /learn/ index (HTTP ${res.status}). Try again shortly, or browse /learn/ directly.`;
      }
      const data = (await res.json()) as { articles?: AgentArticle[] };
      const all = Array.isArray(data.articles) ? data.articles : [];

      const groups = LEARN_CATEGORIES.filter(
        (c) => !category || c.category === category,
      );

      const pointer =
        '\n\nFor the full paginated inventory, call list_doodle_articles.';

      // Budget the body so body + pointer stays under the ceiling. Render groups
      // in order, trimming per-category titles until the whole thing fits.
      const bodyBudget = HARD_CAP - pointer.length - 4;

      function render(perCategory: number): string {
        const blocks: string[] = [];
        for (const g of groups) {
          const items = all.filter((a) => a.category === g.category);
          const head = `${g.label} — ${g.blurb}`;
          if (items.length === 0) {
            blocks.push(`${head}\n(no articles yet)`);
            continue;
          }
          const shown = items.slice(0, perCategory);
          const lines = shown.map((a) => `  • ${clip(a.title, 90)} ${a.url}`);
          const more =
            items.length > shown.length
              ? `\n  (+${items.length - shown.length} more)`
              : '';
          blocks.push(`${head}\n${lines.join('\n')}${more}`);
        }
        return blocks.join('\n\n');
      }

      let perCategory = limit;
      let body = render(perCategory);
      // Shrink per-category count until the body fits its budget.
      while (body.length > bodyBudget && perCategory > 1) {
        perCategory -= 1;
        body = render(perCategory);
      }

      const out = `${body}${pointer}`;
      return clip(out, HARD_CAP);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return 'Browsing /learn/ was cancelled.';
      }
      return 'Could not browse /learn/ right now. Try again shortly, or open /learn/ directly.';
    }
  },
};

/* ============================================================== bundle == */

const bundle: ToolBundle = {
  id: 'learn',
  appliesTo: always,
  tools: [list_doodle_pages, browse_doodle_learn],
};

export default bundle;
