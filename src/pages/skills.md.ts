import type { APIRoute } from "astro";
import { SKILLS, SKILL_CATEGORIES } from "../lib/skills";
import { imageCountForSkill, creditCostForSkill } from "../lib/credits/costs";
import { mdLink, mdPageResponse, mdTable, resolveSite } from "../lib/markdown/page-md";

/**
 * `/skills.md` — the Markdown twin of the /skills/ catalogue.
 *
 * The whole catalogue in one table per category, with the three facts that decide
 * whether a skill fits a request: does it need a photo, how many images does one
 * run return, and what does that cost. Those are exactly the questions an
 * assistant has to answer for someone before recommending a skill, and they are
 * derived from the code that enforces them (`imageCountForSkill`,
 * `creditCostForSkill`) rather than restated here.
 *
 * Non-runnable skills are excluded: listing a skill an agent cannot invoke would
 * be advertising a capability that does not exist.
 */

export const prerender = true;

export const GET: APIRoute = ({ site }) => {
	const base = resolveSite(site);
	const runnable = SKILLS.filter((s) => s.runnable);

	const sections = SKILL_CATEGORIES.filter((c) => c.id !== "for-you")
		.map((category) => {
			const items = runnable.filter((s) => s.category === category.id);
			if (items.length === 0) return null;
			const table = mdTable(
				["Skill", "What it makes", "Photo", "Images", "Credits"],
				items.map((s) => [
					mdLink(s.name, new URL(`/skills/${s.id}.md`, base).href),
					s.tagline,
					s.requiresPhoto ? "Required" : "Not needed",
					String(imageCountForSkill(s.id)),
					String(creditCostForSkill(s.id)),
				]),
			);
			return `## ${category.label} (${items.length})\n\n${table}`;
		})
		.filter((s): s is string => s !== null);

	return mdPageResponse({
		title: "Doodle AI Skills",
		description: `All ${runnable.length} runnable Doodle AI skills — what each one generates, whether it needs a photo, how many images it returns, and what it costs in credits.`,
		canonicalPath: "/skills/",
		site: base,
		frontmatter: { skills: runnable.length, price: "1 credit per image" },
		body: [
			`A skill is one drawing style the agent can pick. There are ${runnable.length} runnable skills. Each costs 1 credit per image it returns, so a single-image skill costs 1 and a multi-image pack costs 1 per frame.`,
			`Each link is the Markdown version of that skill's page — drop the \`.md\` for the browsable page with a real sample output.`,
			...sections,
			`## Links\n\n${[
				mdLink("Skills catalogue (HTML)", new URL("/skills/", base).href),
				mdLink("Free tools", new URL("/tools.md", base).href),
				mdLink("About Doodle AI", new URL("/about.md", base).href),
			]
				.map((l) => `- ${l}`)
				.join("\n")}`,
		],
	});
};
