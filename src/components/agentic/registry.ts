/**
 * WebMCP tool registry — route scoping and the bundle contract.
 *
 * WHY THIS EXISTS
 * ---------------
 * Until now every tool registered on every route, because `WebMcpTools.astro`
 * lives in `AppLayout`. That has two real costs:
 *
 *   1. Agent tool-selection accuracy falls as the tool list grows. Chrome's
 *      WebMCP guidance is explicit that the imperative API is meant for
 *      per-route, per-user registration — not one global set.
 *   2. Tools registered on `/admin/*` and on unauthenticated token routes
 *      (`/s/<token>`, `/join/<token>`) are surface we never intended to expose.
 *
 * A bundle declares WHICH routes it applies to. `selectTools()` resolves the
 * bundles for the current path, enforces the exclusion list, and de-duplicates
 * by tool name (a duplicate name makes Chrome reject the second registration
 * with InvalidStateError, which would look like a random missing tool).
 *
 * OWNERSHIP
 * ---------
 * Each tool module owns exactly one file and default-exports one `ToolBundle`.
 * Wiring bundles into the page is done ONLY in `WebMcpTools.astro`, so adding a
 * tool module never means editing a file someone else owns.
 */
import type { WebMcpToolDef } from './tools-content';

/** Decides whether a bundle applies to a given pathname. */
export type RouteMatcher = (path: string) => boolean;

/**
 * One cohesive group of tools plus the routes it belongs on.
 *
 * `id` is for diagnostics only (it shows up in `window.__doodleWebMcp`), so a
 * missing tool can be traced to the bundle that should have provided it.
 */
export interface ToolBundle {
  id: string;
  appliesTo: RouteMatcher;
  tools: WebMcpToolDef[];
}

/**
 * Routes where NO tool may register, regardless of what a bundle claims.
 *
 * `/admin` is staff-only and its tools would describe internal operations.
 * `/s/` and `/join/` are unauthenticated token surfaces reached by anyone
 * holding a link, so they get no agent affordances at all. Enforced centrally
 * in `selectTools()` rather than trusted to each matcher.
 */
export const EXCLUDED_PREFIXES = ['/admin', '/s/', '/join/'] as const;

/** Normalise a pathname so matchers can ignore trailing-slash variance. */
function normalise(path: string): string {
  if (path.length > 1 && path.endsWith('/')) return path.slice(0, -1);
  return path;
}

/**
 * Segment-aware prefix match: `path` is `prefixPath` or lives beneath it.
 *
 * A naive `startsWith` after trailing-slash normalisation is WRONG and was
 * caught by a live browser run: the `/s/` share-token exclusion normalises to
 * `/s`, and `'/skills'.startsWith('/s')` is true — so `/skills`, `/status` and
 * `/settings` were all treated as excluded routes and registered zero tools.
 * Matching must therefore stop at a segment boundary: `/s/` matches `/s/abc`
 * but never `/skills`.
 */
function matchesPrefix(path: string, prefixPath: string): boolean {
  const p = normalise(path);
  const q = normalise(prefixPath);
  if (q === '' || q === '/') return true;
  return p === q || p.startsWith(`${q}/`);
}

/* -------------------------------------------------------------- matchers -- */

/** Applies everywhere that is not excluded. Use for the small global core. */
export const always: RouteMatcher = () => true;

/** Applies only to these exact paths (trailing slash insensitive). */
export function exact(...paths: string[]): RouteMatcher {
  const set = new Set(paths.map(normalise));
  return (path) => set.has(normalise(path));
}

/** Applies to any path starting with one of these prefixes. */
export function prefix(...prefixes: string[]): RouteMatcher {
  return (path) => prefixes.some((p) => matchesPrefix(path, p));
}

/** Inverts a matcher. */
export function not(matcher: RouteMatcher): RouteMatcher {
  return (path) => !matcher(path);
}

/** True when any matcher matches. */
export function either(...matchers: RouteMatcher[]): RouteMatcher {
  return (path) => matchers.some((m) => m(path));
}

/**
 * Product routes — everything that is NOT an editorial article.
 *
 * Articles live at keyword-first top-level paths (`/photo-to-cartoon/`,
 * `/for-studios/ai-filmmaker-stills/`) served by the catch-all
 * `src/pages/[...path].astro`, so "is this an article?" cannot be answered by
 * a path prefix. It is answered by ELIMINATION: list the product routes, and
 * treat the rest as editorial. Keep this list in sync when a route is added —
 * a missed entry only means an article bundle also loads on a product page,
 * which is harmless, not broken.
 */
export const PRODUCT_PREFIXES = [
  '/skills',
  '/learn',
  '/boards',
  '/b/',
  '/c/',
  '/roadmap',
  '/projects',
  '/team',
  '/settings',
  '/characters',
  '/moodboards',
  '/status',
  '/about',
  '/privacy',
  '/terms',
  '/admin',
  '/s/',
  '/join/',
] as const;

/** The composer home page, and nothing else. */
export const isHome: RouteMatcher = (path) => normalise(path) === '';

/** An editorial article page (the catch-all route), excluding the home page. */
export const isArticle: RouteMatcher = (path) => {
  const p = normalise(path);
  if (p === '') return false;
  return !PRODUCT_PREFIXES.some((prefixPath) => matchesPrefix(p, prefixPath));
};

/** A single skill page, e.g. `/skills/normal/` — not the `/skills/` index. */
export const isSkillPage: RouteMatcher = (path) => {
  const p = normalise(path);
  return matchesPrefix(p, '/skills') && p !== '/skills';
};

/* ------------------------------------------------------------- selection -- */

/** True when tools must not register on this path at all. */
export function isExcludedRoute(path: string): boolean {
  const p = normalise(path);
  return EXCLUDED_PREFIXES.some((prefixPath) => matchesPrefix(p, prefixPath));
}

export interface SelectionResult {
  tools: WebMcpToolDef[];
  /** Bundle ids that contributed, for diagnostics. */
  bundles: string[];
  /** Tool names dropped because an earlier bundle already claimed the name. */
  duplicates: string[];
  excluded: boolean;
}

/**
 * Resolve the tools that should register on `path`.
 *
 * Order matters only for duplicate resolution: the first bundle to claim a name
 * wins, so list the global core first and let route-scoped bundles specialise
 * around it rather than silently shadowing it.
 */
export function selectTools(bundles: ToolBundle[], path: string): SelectionResult {
  if (isExcludedRoute(path)) {
    return { tools: [], bundles: [], duplicates: [], excluded: true };
  }

  const tools: WebMcpToolDef[] = [];
  const seen = new Set<string>();
  const used: string[] = [];
  const duplicates: string[] = [];

  for (const bundle of bundles) {
    let contributed = false;
    if (!bundle.appliesTo(path)) continue;
    for (const tool of bundle.tools) {
      if (seen.has(tool.name)) {
        duplicates.push(tool.name);
        continue;
      }
      seen.add(tool.name);
      tools.push(tool);
      contributed = true;
    }
    if (contributed) used.push(bundle.id);
  }

  return { tools, bundles: used, duplicates, excluded: false };
}
