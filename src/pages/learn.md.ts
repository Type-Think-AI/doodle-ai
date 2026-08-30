import type { APIRoute } from "astro";
import { getArticlesByCategory } from "../lib/content/articles";
import { mdLink, mdPageResponse, resolveSite } from "../lib/markdown/page-md";

/**
 * `/learn.md` — the Markdown twin of the /learn/ library index.
 *
 * This is the page an agent lands on when it wants to know what exists before
 * fetching anything, so every entry links the sibling `.md` rather than the HTML:
 * an agent that follows these links never has to parse a page of ours at all.
 *
 * Kept in step with /learn/ by reading the same `getArticlesByCategory()` helper
 * the Astro page uses, so a new article appears in both without anyone editing a
 * list.
 */

export const prerender = true;

export const GET: APIRoute = async ({ site }) => {
	const base = resolveSite(site);
	const groups = await getArticlesByCategory();
	const total = groups.reduce((sum, group) => sum + group.items.length, 0);

	const sections = groups.map((group) => {
		const items = group.items
			.map((item) => `- ${mdLink(item.title, new URL(`/${item.path}.md`, base).href)} — ${item.description}`)
			.join("\n");
		return `## ${group.label}\n\n${group.blurb}\n\n${items}`;
	});

	return mdPageResponse({
		title: "Doodle AI — Learn",
		description:
			"Guides, explainers, prompt packs and free tools for turning photos into hand-drawn doodle art.",
		canonicalPath: "/learn/",
		site: base,
		frontmatter: { pages: total },
		body: [
			`Every page on this site is available as Markdown by appending \`.md\` to its URL — for example ${new URL("/photo-to-cartoon/", base).href} is also served as ${new URL("/photo-to-cartoon.md", base).href}.`,
			`Every link below is already the Markdown version; drop the \`.md\` for the browsable HTML.`,
			...sections,
			`## Other indexes\n\n${[
				mdLink("Free tools", new URL("/tools.md", base).href),
				mdLink("Skills catalogue", new URL("/skills.md", base).href),
				mdLink("About Doodle AI", new URL("/about.md", base).href),
				mdLink("llms.txt (short index)", new URL("/llms.txt", base).href),
			]
				.map((l) => `- ${l}`)
				.join("\n")}`,
		],
	});
};
