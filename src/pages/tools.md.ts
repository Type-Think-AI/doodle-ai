import type { APIRoute } from "astro";
import { getToolsBySkill } from "../lib/content/articles";
import { getSkill } from "../lib/skills";
import { mdLink, mdPageResponse, mdTable, resolveSite } from "../lib/markdown/page-md";

/**
 * `/tools.md` — the Markdown twin of the /tools/ hub.
 *
 * Grouped by powering skill, matching the HTML page, because that is the one fact
 * a visitor (or an agent) cannot read off the titles: seven coloring URLs really
 * are one skill wearing seven keywords, and flattening them into an alphabetical
 * list would hide it.
 *
 * Each row links the tool's own `.md`, not its HTML, so an agent following this
 * page never has to parse markup. Built from the same `getToolsBySkill()` helper
 * the page uses, so a page converted to a tool appears in both.
 */

export const prerender = true;

export const GET: APIRoute = async ({ site }) => {
	const base = resolveSite(site);
	const groups = await getToolsBySkill();
	const total = groups.reduce((n, g) => n + g.items.length, 0);

	const sections = groups.map((group) => {
		const skill = getSkill(group.skill);
		const heading = `## ${skill?.name ?? group.skill} (${group.items.length})`;
		const note = skill?.tagline ? `${skill.tagline}\n` : "";
		const table = mdTable(
			["Tool", "What it does"],
			group.items.map((item) => [
				mdLink(item.title, new URL(`/${item.path}.md`, base).href),
				item.description,
			]),
		);
		return `${heading}\n\n${note}\n${table}`;
	});

	return mdPageResponse({
		title: "Free Doodle AI Tools",
		description: `${total} free browser tools that turn a photo into a hand-drawn doodle, cartoon, sticker, or printable coloring page. Each opens with the generator ready and the right skill already selected.`,
		canonicalPath: "/tools/",
		site: base,
		frontmatter: { tools: total, price: "free" },
		body: [
			`${total} free tools. Every one is a working generator, not an article: the prompt box is the first thing on the page and the right skill is already selected. Grouped below by the skill that powers them.`,
			`Each link is the Markdown version — drop the \`.md\` for the browsable page.`,
			...sections,
			`## Links\n\n${[
				mdLink("Tools hub (HTML)", new URL("/tools/", base).href),
				mdLink("Skills catalogue", new URL("/skills.md", base).href),
				mdLink("All content, Markdown", new URL("/learn.md", base).href),
			]
				.map((l) => `- ${l}`)
				.join("\n")}`,
		],
	});
};
