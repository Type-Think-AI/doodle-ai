/* The union layer over the two editorial collections.
 *
 * WHY THERE ARE TWO COLLECTIONS AND ONE URL SPACE
 *
 * Prompt pages were moved out of `src/content/articles/` into
 * `src/content/prompts/` so prompt content is authored and validated on its own
 * terms rather than as a blog category. Their URLs did NOT change: they are
 * still keyword-first root paths (`/doodle-prompts/`,
 * `/ai-cartoon-generator/prompts/`) because those are indexed and search is this
 * product's only marketing channel — moving them would have reset their
 * rankings for a rename nobody outside the repo can see.
 *
 * That means the two collections SHARE one root URL namespace, which has one
 * hard consequence: every place that used to read `getCollection("articles")`
 * must read this union instead, or the moved pages 404 in production while
 * building perfectly. `assertContentPaths` is likewise fed the union, so a
 * prompt page and an article claiming the same path is a build error rather than
 * a coin flip over which one Astro renders.
 *
 * The directory layout inside `src/content/prompts/` therefore still IS the
 * public URL, exactly as it is for articles:
 *
 *   prompts/doodle-prompts/index.md            -> /doodle-prompts/
 *   prompts/ai-cartoon-generator/prompts.md    -> /ai-cartoon-generator/prompts/
 */
import { getCollection, type CollectionEntry } from "astro:content";
import type { Category } from "./taxonomy";

export type ArticleEntry = CollectionEntry<"articles">;
export type PromptEntry = CollectionEntry<"prompts">;

/** An entry from either editorial collection. */
export type EditorialEntry = ArticleEntry | PromptEntry;

/**
 * Every editorial entry, articles and prompts together.
 *
 * Unsorted — callers order by whatever they render (pubDate for the RSS feed and
 * `getArticleLinks`, path for the reserved-route check).
 */
export async function getEditorialEntries(): Promise<EditorialEntry[]> {
  const [articles, prompts] = await Promise.all([
    getCollection("articles"),
    getCollection("prompts"),
  ]);
  return [...articles, ...prompts];
}

/**
 * The entry's editorial format.
 *
 * An article declares it in frontmatter. A prompt page does not declare one at
 * all — the collection it lives in already says what it is, and a `category`
 * field there would only create the possibility of a prompt page claiming to be
 * a guide. So the value is injected from the collection name, which is the one
 * fact that cannot be wrong.
 */
export function entryCategory(entry: EditorialEntry): Category {
  return entry.collection === "prompts" ? "prompts" : entry.data.category;
}

/**
 * Source path for build-error messages.
 *
 * The glob loader exposes `filePath`; the fallback reconstructs it from the
 * collection and id, which is why the collection name is needed here rather
 * than hardcoding `src/content/articles/` as the old call site did — that would
 * now name the wrong directory for half the entries.
 */
export function entryFile(entry: EditorialEntry): string {
  return entry.filePath ?? `src/content/${entry.collection}/${entry.id}.md`;
}

/**
 * What a page template actually needs: every editorial field, with `category`
 * guaranteed present.
 *
 * Templates cannot take `EditorialEntry["data"]` directly, because a prompt
 * page has no `category` key at all and every layout reads one. Built from the
 * prompt shape plus a resolved category rather than from the article shape,
 * because the prompt schema IS the shared base — so this type cannot silently
 * gain an article-only field.
 */
export type EditorialPageData = PromptEntry["data"] & { category: Category };

/** Entry -> template props, with the collection's category folded in. */
export function editorialPageData(entry: EditorialEntry): EditorialPageData {
  return { ...entry.data, category: entryCategory(entry) };
}
