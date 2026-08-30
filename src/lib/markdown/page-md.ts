/**
 * One place to build a `.md` twin of a page.
 *
 * WHY THIS EXISTS
 * Every page on the site should be readable as clean Markdown, because AI
 * assistants and agent crawlers fetch pages as text: handed HTML they spend their
 * context window on our nav, scripts and inline SVG before reaching a sentence of
 * prose, and several probe for a `.md` sibling. `/llms.txt` is the MAP of the
 * site; these are the documents it points at.
 *
 * The first three endpoints (articles, /learn, /about) each hand-rolled their own
 * frontmatter, their own table rendering and their own response headers. That is
 * three places to forget `X-Robots-Tag`, three subtly different pipe-table
 * escapes, and three chances for one page's twin to look nothing like another's.
 * Everything shared now lives here and the endpoints are thin.
 *
 * WHY NOT AN INTEGRATION
 * The published options (astro-slop, astro-mark-don, astro-llms-md) centre on
 * converting rendered HTML back into Markdown. Our content is already structured
 * — collection markdown, or typed data in src/lib — so a round-trip through HTML
 * would only lose fidelity, and the most complete of them still requires a
 * hand-written endpoint per route, which is what these files are. astro-slop also
 * shares state via `globalThis[Symbol.for(...)]` and warns that worker runtimes
 * may need a different mechanism; this project deploys to Cloudflare Workers.
 *
 * CONVENTIONS EVERY TWIN FOLLOWS
 *   - `text/markdown; charset=utf-8`, so a client that content-negotiates gets
 *     the right type rather than guessing from the extension.
 *   - A `Link: <canonical>; rel="canonical"` header pointing at the HTML page.
 *     The `.md` is an alternate representation, not a competing document.
 *   - `X-Robots-Tag: noindex`, for the same reason — we want the HTML page
 *     ranked and the Markdown read, not two URLs competing for one query.
 */

/** Values allowed in a frontmatter block. `undefined` keys are dropped. */
export type FrontmatterValue = string | number | boolean | undefined | null;

export interface MdPageInit {
	/** Document title, emitted as frontmatter `title` and the H1. */
	title: string;
	/** Root-relative path of the HTML page this mirrors, e.g. "/tools/". */
	canonicalPath: string;
	/** `Astro.site`, or a fallback. */
	site: URL;
	/** Extra frontmatter keys. `title`, `description` and `url` are handled. */
	frontmatter?: Record<string, FrontmatterValue>;
	description?: string;
	/**
	 * Body blocks, joined with a blank line. `null`/`undefined`/"" entries are
	 * dropped so a caller can inline conditionals without leaving holes.
	 */
	body: (string | null | undefined)[];
	/** Omit the H1 when the body already opens with one (e.g. collection bodies). */
	skipHeading?: boolean;
}

/**
 * Quote a frontmatter scalar.
 *
 * `JSON.stringify` is exactly right for strings here: YAML's double-quoted style
 * uses the same `\"` / `\\` escapes, and our titles and descriptions routinely
 * contain colons and apostrophes that would otherwise produce an unparseable
 * block. Numbers and booleans are emitted bare so they stay typed.
 */
function frontmatterScalar(value: string | number | boolean): string {
	return typeof value === "string" ? JSON.stringify(value) : String(value);
}

export function mdFrontmatter(entries: Record<string, FrontmatterValue>): string {
	const lines = Object.entries(entries)
		.filter(([, v]) => v !== undefined && v !== null && v !== "")
		.map(([k, v]) => `${k}: ${frontmatterScalar(v as string | number | boolean)}`);
	return ["---", ...lines, "---"].join("\n");
}

/**
 * Escape one table cell. A literal `|` would end the cell and shift every column
 * after it, and an embedded newline would end the row entirely, so both are
 * neutralised rather than trusted.
 */
export function mdCell(value: string): string {
	return value.replace(/\|/g, "\\|").replace(/\s*\n+\s*/g, " ").trim();
}

/** A GitHub-flavoured pipe table. Empty header cells render as a single space. */
export function mdTable(head: readonly string[], rows: readonly (readonly string[])[]): string {
	const header = `| ${head.map((h) => mdCell(h) || " ").join(" | ")} |`;
	const rule = `| ${head.map(() => "---").join(" | ")} |`;
	const body = rows.map((row) => `| ${row.map(mdCell).join(" | ")} |`).join("\n");
	return [header, rule, body].filter(Boolean).join("\n");
}

export function mdLink(text: string, url: string): string {
	// Only `[` and `]` break link text; leaving other punctuation alone keeps
	// titles readable rather than backslash-littered.
	return `[${text.replace(/([[\]])/g, "\\$1")}](${url})`;
}

/** `- item` lines. */
export function mdList(items: readonly string[]): string {
	return items.map((item) => `- ${item}`).join("\n");
}

/** `## Heading` + body, or an empty string when there is no body. */
export function mdSection(heading: string, body: string | null | undefined): string {
	return body ? `${heading}\n\n${body}` : "";
}

/** Assemble the full document text. */
export function buildMdPage(init: MdPageInit): string {
	const canonical = new URL(init.canonicalPath, init.site).href;
	const front = mdFrontmatter({
		title: init.title,
		description: init.description,
		url: canonical,
		...init.frontmatter,
	});
	const blocks = init.body.filter((b): b is string => Boolean(b && b.trim()));
	const heading = init.skipHeading ? [] : [`# ${init.title}`];
	return [front, "", ...heading, ...(init.skipHeading ? [] : [""]), blocks.join("\n\n"), ""].join("\n");
}

/** Wrap markdown in the response every twin shares. */
export function markdownResponse(markdown: string, canonicalHref: string): Response {
	return new Response(markdown, {
		headers: {
			"Content-Type": "text/markdown; charset=utf-8",
			"Cache-Control": "public, max-age=3600",
			Link: `<${canonicalHref}>; rel="canonical"`,
			"X-Robots-Tag": "noindex",
		},
	});
}

/** Build and respond in one call — what an endpoint normally wants. */
export function mdPageResponse(init: MdPageInit): Response {
	const canonical = new URL(init.canonicalPath, init.site).href;
	return markdownResponse(buildMdPage(init), canonical);
}

/** `Astro.site` with the production fallback every endpoint uses. */
export function resolveSite(site: URL | undefined): URL {
	return site ?? new URL("https://doodleai.art");
}
