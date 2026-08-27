/**
 * Reserved top-level URL segments.
 *
 * Editorial content lives at keyword-first root URLs (`/photo-to-cartoon/`,
 * `/ai-cartoon-generator/`), which means the content collection shares the root
 * namespace with every product route. Astro resolves a static page before a
 * dynamic catch-all, so a colliding article would not break the product page —
 * it would just never render, silently, and only in production.
 *
 * This module turns that silent failure into a build error.
 *
 * Keep this list in sync with `src/pages/`.
 */
export const RESERVED_SEGMENTS: ReadonlySet<string> = new Set([
	// Product + marketing pages
	"about",
	"boards",
	"b",
	"characters",
	"moodboards",
	"projects",
	"roadmap",
	"settings",
	"skills",
	"team",
	// Content directory index
	"learn",
	// Legal, plus the legacy short paths that 308 to them
	"privacy",
	"privacy-policy",
	"terms",
	"terms-of-service",
	// Short-link and invite routes
	"c",
	"join",
	"s",
	// Server routes and generated files
	"api",
	"robots.txt",
	"rss.xml",
	"sitemap.xml",
	// Retired: kept reserved so an article cannot resurrect the old blog path
	"blog",
]);

/**
 * Segments that are intentionally shared between a static index page and
 * content children — `/for-studios/` is an Astro listing page while
 * `/for-studios/ai-filmmaker-stills/` comes from the collection.
 *
 * A namespace may only ever be used as a *prefix*: an article that resolves to
 * the bare namespace would collide with the listing page, so that still throws.
 */
export const CONTENT_NAMESPACES: ReadonlySet<string> = new Set(["for-studios"]);

/**
 * Throws when a generated article path would collide with an app route, or when
 * two articles resolve to the same URL.
 *
 * Called from `getStaticPaths` in `src/pages/[...path].astro`, so a bad filename
 * fails `astro build` with the offending file named, rather than shipping.
 */
export function assertContentPaths(entries: { path: string; file: string }[]): void {
	const seen = new Map<string, string>();

	for (const { path, file } of entries) {
		if (!path) {
			throw new Error(
				`[content] "${file}" resolved to an empty URL. A top-level index.md is not allowed; ` +
					`put it in a named folder, e.g. articles/photo-to-cartoon/index.md`,
			);
		}

		if (path.startsWith("/") || path.endsWith("/")) {
			throw new Error(`[content] "${file}" produced a malformed path "${path}".`);
		}

		const duplicate = seen.get(path);
		if (duplicate) {
			throw new Error(
				`[content] "${file}" and "${duplicate}" both resolve to /${path}/. ` +
					`Rename one of them.`,
			);
		}
		seen.set(path, file);

		const [first] = path.split("/");

		if (CONTENT_NAMESPACES.has(first)) {
			if (path === first) {
				throw new Error(
					`[content] "${file}" resolves to /${path}/, which is owned by the ` +
						`src/pages/${first}/index.astro listing page. Give the article its own child slug.`,
				);
			}
			continue;
		}

		if (RESERVED_SEGMENTS.has(first)) {
			throw new Error(
				`[content] "${file}" resolves to /${path}/, but "${first}" is a reserved app route ` +
					`(see src/lib/content/reserved-routes.ts). Choose a different top-level folder.`,
			);
		}
	}
}

/**
 * Collection entry id -> public URL path (no leading or trailing slash).
 *
 * Astro's glob loader already strips a trailing `/index` from the id, so this is
 * mostly a defensive normalisation — but it also catches a stray top-level
 * `index.md`, which would otherwise resolve to the site root and quietly shadow
 * the landing page.
 *
 * `photo-to-cartoon` -> `photo-to-cartoon`
 * `photo-to-cartoon/index` -> `photo-to-cartoon`
 * `ai-cartoon-generator/prompts` -> `ai-cartoon-generator/prompts`
 */
export function idToPath(id: string): string {
	return id.replace(/\/index$/, "").replace(/^index$/, "");
}
