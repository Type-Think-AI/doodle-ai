import type { APIRoute } from "astro";
import {
	DEFINITION,
	FAQ,
	FIGURES,
	GLANCE_ROWS,
	COMPARISON_HEAD,
	COMPARISON_ROWS,
	ROADMAP_ROWS,
	CATEGORY_ROWS,
} from "../lib/content/about-content";
import { mdLink, mdPageResponse, mdTable, resolveSite } from "../lib/markdown/page-md";

/**
 * `/about.md` — the Markdown twin of /about/.
 *
 * WHY IT IS A SEPARATE FILE RATHER THAN AUTOMATIC: `[...path].md.ts` covers the
 * content-collection articles because those have a raw markdown `body` to serve.
 * /about is a hand-written Astro page, so it needs an endpoint that renders the
 * same content in markdown form.
 *
 * NO DRIFT BY CONSTRUCTION: every table, figure and FAQ answer is imported from
 * src/lib/content/about-content.ts, which exists for exactly this reason. The HTML
 * page and this file render one source two ways — never hand-copy prose between
 * them, which is how a machine-readable twin ends up contradicting the page it
 * claims to mirror.
 */

export const prerender = true;

export const GET: APIRoute = ({ site }) => {
	const base = resolveSite(site);

	return mdPageResponse({
		title: "About Doodle AI",
		description: DEFINITION,
		canonicalPath: "/about/",
		site: base,
		frontmatter: {
			skills: FIGURES.runnable,
			generates: "images",
			video: false,
			price: "free",
		},
		body: [
			DEFINITION,
			`## Doodle AI at a glance\n\n${mdTable(["Property", "Value"], GLANCE_ROWS.map(([k, v]) => [k, v]))}`,
			`## What the skills can generate\n\nEvery drawing style is a skill. The chat and the free tool pages draw on the same catalogue, so nothing is exclusive to one route.\n\n${mdTable(
				["Category", "Skills", "Photo needed", "Images per run", "Examples"],
				CATEGORY_ROWS.map((r) => [r.label, String(r.count), r.photo, r.images, r.examples]),
			)}`,
			`${FIGURES.packSkills} of the ${FIGURES.runnable} skills are multi-image packs: one request returns a whole set — a run of expressions, four seasons, a sheet of stickers — rather than a single frame.`,
			`## How Doodle AI compares\n\n${mdTable(
				COMPARISON_HEAD.map((h) => h || "Dimension"),
				COMPARISON_ROWS,
			)}`,
			`## Roadmap\n\nNothing in this table is available today.\n\n${mdTable(
				["Planned", "Status"],
				ROADMAP_ROWS.map(([k, v]) => [k, v]),
			)}`,
			`## Frequently asked questions\n\n${FAQ.map(
				(item) => `### ${item.question}\n\n${item.answer}`,
			).join("\n\n")}`,
			`## Links\n\n${[
				mdLink("Doodle AI home", base.href),
				mdLink("Free tools", new URL("/tools.md", base).href),
				mdLink("Skills catalogue", new URL("/skills.md", base).href),
				mdLink("All content, Markdown", new URL("/learn.md", base).href),
			]
				.map((l) => `- ${l}`)
				.join("\n")}`,
		],
	});
};
