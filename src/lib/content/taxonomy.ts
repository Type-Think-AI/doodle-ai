/* The editorial taxonomy: clusters, formats, and what each format is worth.
 *
 * Extracted from ./articles.ts when prompt pages moved into their own
 * collection. It lives alone for two reasons:
 *
 *  1. `src/content.config.ts` imports CLUSTERS to build the zod enum for BOTH
 *     collections, so there is one cluster list instead of two that drift. It
 *     cannot import ./articles.ts to get it — that module calls
 *     `getCollection`, and the config file is what defines the collections.
 *
 *  2. `Category` is now a union across two collections rather than a type
 *     derived from one schema, so it needs a home that neither collection owns.
 *     ./articles.ts re-exports everything here, so existing imports from that
 *     path keep working.
 */

/**
 * Topic silos, used to compute "related reading" automatically so publishing
 * article N+1 links it into the existing set without editing any of them.
 */
export const CLUSTERS = [
  "cartoon",
  "pets",
  "stickers",
  "gifts",
  "social",
  "studios",
  "doodle",
  "coloring",
  "festival",
  "learn",
  "video",
] as const;

export type Cluster = (typeof CLUSTERS)[number];

/** Formats that live in the `articles` collection. */
export const ARTICLE_CATEGORIES = ["guide", "explainer", "studios", "tool"] as const;

export type ArticleCategory = (typeof ARTICLE_CATEGORIES)[number];

/**
 * Every editorial format across both collections.
 *
 * `prompts` is deliberately NOT in `ARTICLE_CATEGORIES`: prompt pages are their
 * own collection and do not declare a category in frontmatter at all — the
 * value is injected from the collection they came from (see
 * `entryCategory` in ./editorial.ts). Dropping it from the article enum is what
 * makes a leftover `category: "prompts"` in src/content/articles/ a build error
 * rather than a page that quietly renders from the wrong collection.
 */
export type Category = ArticleCategory | "prompts";

/** Human labels for the editorial formats. Used as the article eyebrow and on /learn/. */
export const CATEGORY_LABEL: Record<Category, string> = {
  tool: "Free tool",
  guide: "Guide",
  explainer: "Explainer",
  prompts: "Prompts",
  studios: "For studios",
};

/** Order the categories appear in on /learn/, highest search intent first. */
export const CATEGORY_ORDER: readonly Category[] = [
  "tool",
  "guide",
  "explainer",
  "prompts",
  "studios",
];

export const CATEGORY_BLURB: Record<Category, string> = {
  tool: "Open one, describe it, generate. The skill is already selected.",
  guide: "Step-by-step processes for one photo and one result.",
  explainer: "What a term actually means, and which job you have.",
  prompts: "Copyable prompt patterns for the runnable skills.",
  studios: "Production workflows for studios and filmmakers.",
};

/**
 * Sitemap priority per format. Tool pages rank highest because they are the only
 * ones where the page itself completes the searcher's job rather than describing
 * how to complete it.
 */
export const CATEGORY_PRIORITY: Record<Category, string> = {
  tool: "0.9",
  guide: "0.8",
  explainer: "0.8",
  prompts: "0.7",
  studios: "0.6",
};
