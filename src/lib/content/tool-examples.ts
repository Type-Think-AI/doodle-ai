/**
 * This page's example images, from `scripts/tool-examples.json`.
 *
 * Imported as JSON at build time rather than fetched, so a missing or partial
 * manifest is a compile-time fact instead of a runtime hole — and the values are
 * plain CDN URLs, so nothing here costs a request at render.
 *
 * KEYED BY SLUG, NOT BY SKILL. The manifest's first version keyed galleries by
 * skill, which meant all seven coloring URLs rendered the same three images —
 * making the cluster look MORE templated, which is the opposite of the point of
 * the tool-page work. Each page now declares its own examples in
 * `scripts/generate-tool-examples.mjs`, chosen to match what that page's keyword
 * actually promises.
 *
 * A page with no manifest entry gets an empty array and renders no gallery. That
 * is deliberate: showing another page's images as if they were this one's would
 * misrepresent what the tool produces.
 *
 * Lives here rather than inside a component so the layout can read it once and
 * hand it to whichever component needs it, instead of two components each
 * importing and re-deriving the same JSON.
 */
import manifest from "../../../scripts/tool-examples.json";

interface ToolExampleManifest {
	pages?: Record<string, { skill: string; examples: string[] }>;
}

export function getToolExamples(slug: string): string[] {
	return (manifest as ToolExampleManifest).pages?.[slug]?.examples ?? [];
}
