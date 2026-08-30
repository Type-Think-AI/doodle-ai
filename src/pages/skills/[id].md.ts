import type { APIRoute } from "astro";
import { SKILLS, type Skill } from "../../lib/skills";
import { imageCountForSkill, creditCostForSkill } from "../../lib/credits/costs";
import { mdLink, mdPageResponse, mdTable, resolveSite } from "../../lib/markdown/page-md";

/**
 * `/skills/<id>.md` — one Markdown document per skill.
 *
 * Paths are derived from SKILLS rather than re-exported from `[id].astro`:
 * `import … from "./[id].astro"` fails `tsc --noEmit` with TS2307 (TypeScript
 * cannot resolve `.astro`), a trap already hit on `[...path].md.ts` and
 * `about.md.ts`. Filtering on `runnable` matches the HTML route's own filter.
 *
 * WHAT IS DELIBERATELY NOT INCLUDED: the skill's `instructions` — the full
 * SKILL.md prompt body. It is the model-facing implementation, it is long enough
 * to swamp the useful facts, and publishing it invites prompt copying without
 * helping anyone decide whether the skill fits. `description` (the "use when the
 * user…" line) carries the same intent in one sentence and IS included, because
 * it is the most concrete statement of what the skill is for.
 */

export const prerender = true;

export function getStaticPaths() {
	return SKILLS.filter((s) => s.runnable).map((skill) => ({
		params: { id: skill.id },
		props: { skill },
	}));
}

interface Props {
	skill: Skill;
}

export const GET: APIRoute<Props> = ({ props, site }) => {
	const base = resolveSite(site);
	const { skill } = props;
	const images = imageCountForSkill(skill.id);

	const facts = mdTable(
		["Property", "Value"],
		[
			["Skill id", skill.id],
			["What it makes", skill.tagline],
			["Category", skill.category],
			["Photo required", skill.requiresPhoto ? "Yes" : "No — describe it instead"],
			["Images per run", String(images)],
			["Credit cost", `${creditCostForSkill(skill.id)} (1 per image)`],
			["Aspect ratio", skill.aspectRatio],
			["Output", "Still image (PNG). Doodle AI does not generate video"],
			...(skill.tags.length ? ([["Tags", skill.tags.join(", ")]] as [string, string][]) : []),
		],
	);

	return mdPageResponse({
		title: skill.name,
		description: skill.desc || skill.tagline,
		canonicalPath: `/skills/${skill.id}/`,
		site: base,
		frontmatter: {
			skill_id: skill.id,
			requires_photo: skill.requiresPhoto,
			images_per_run: images,
			credits: creditCostForSkill(skill.id),
		},
		body: [
			skill.longDesc || skill.desc || skill.tagline,
			facts,
			skill.description ? `## When to use it\n\n${skill.description}` : "",
			images > 1
				? `## Multi-image pack\n\nOne run of this skill returns ${images} separate images rather than a single frame, and is charged ${images} credits — 1 per image. Failed images are refunded.`
				: "",
			`## How to run it\n\n${[
				`Open ${mdLink("Doodle AI", base.href)} and ${
					skill.requiresPhoto ? "attach a photo" : "describe what you want"
				}.`,
				`Ask for it by name — "${skill.name}" — or let the agent pick it from your request.`,
				`Refine in plain language afterwards: "thicker outline", "warmer paper".`,
			]
				.map((l) => `- ${l}`)
				.join("\n")}`,
			`## Links\n\n${[
				mdLink(`${skill.name} page (HTML)`, new URL(`/skills/${skill.id}/`, base).href),
				mdLink("All skills", new URL("/skills.md", base).href),
				mdLink("Free tools", new URL("/tools.md", base).href),
			]
				.map((l) => `- ${l}`)
				.join("\n")}`,
		],
	});
};
