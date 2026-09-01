import type { APIRoute } from "astro";
import { SKILLS } from "../lib/skills";
import { imageCountForSkill } from "../lib/credits/costs";
import { MAX_VIDEO_SECONDS, MIN_VIDEO_SECONDS } from "../lib/video/constants";
import { DEFINITION, FIGURES, GLANCE_ROWS } from "../lib/content/about-content";
import { mdLink, mdPageResponse, mdTable, resolveSite } from "../lib/markdown/page-md";

/**
 * `/index.md` — the Markdown twin of the homepage.
 *
 * This was the gap: the homepage is the page an assistant is most likely to fetch
 * when asked "what is <site>", and it had no twin. Worse, it is the WORST page to
 * leave HTML-only — it is almost entirely an interactive composer plus a grid of
 * image cards, so an HTML-to-text pass yields button labels and alt text rather
 * than an explanation of the product.
 *
 * So this is not a transcript of the homepage markup. It answers, in text, what
 * the homepage communicates visually: what this is, how to start, and what it can
 * make. The definition and figures come from the same about-content module the
 * /about page and /about.md use, so all three agree word for word.
 */

export const prerender = true;

export const GET: APIRoute = ({ site }) => {
	const base = resolveSite(site);
	const runnable = SKILLS.filter((s) => s.runnable);

	const skillTable = mdTable(
		["Skill", "What it makes", "Photo", "Output"],
		runnable.map((s) => [
			mdLink(s.name, new URL(`/skills/${s.id}.md`, base).href),
			s.tagline,
			s.requiresPhoto ? "Required" : "Not needed",
			/* A video skill has no frame count — imageCountForSkill() is defined over
			   the image modes and throws for one by design, which is the same guard
			   that stops a clip being charged as a single image. */
			s.kind === "video"
				? `${MIN_VIDEO_SECONDS}-${MAX_VIDEO_SECONDS}s clip`
				: `${imageCountForSkill(s.id)} image(s)`,
		]),
	);

	return mdPageResponse({
		title: "Doodle AI — Turn a Photo Into a Hand-Drawn Doodle",
		description: DEFINITION,
		canonicalPath: "/",
		site: base,
		frontmatter: {
			skills: FIGURES.runnable,
			generates: "images",
			video: false,
			price: "free",
			signup_credits: FIGURES.signupGrant,
		},
		body: [
			DEFINITION,
			`## Start here\n\n${[
				`Open ${mdLink("doodleai.art", base.href)} and sign in with Google — creation needs an account, browsing does not.`,
				`Attach a photo, @mention a saved character, or just describe someone for a surprise.`,
				`The agent picks one of the ${FIGURES.runnable} skills and draws it. No prompt engineering, no filter grid.`,
				`Refine in plain language — "thicker outline", "warmer paper" — or take one of the three follow-ups it offers.`,
			]
				.map((l) => `- ${l}`)
				.join("\n")}`,
			`## At a glance\n\n${mdTable(["Property", "Value"], GLANCE_ROWS.map(([k, v]) => [k, v]))}`,
			`## Every skill\n\n${skillTable}`,
			`## Two ways in\n\n- **The chat studio** — describe what you want and the agent picks the skill. All ${FIGURES.runnable} skills.\n- **Free tool pages** — single-purpose screens where the generator is the first thing on the page and the skill is already selected. See ${mdLink("the tools hub", new URL("/tools.md", base).href)}.`,
			`## Links\n\n${[
				mdLink("Homepage (HTML)", base.href),
				mdLink("About Doodle AI", new URL("/about.md", base).href),
				mdLink("Free tools", new URL("/tools.md", base).href),
				mdLink("Skills catalogue", new URL("/skills.md", base).href),
				mdLink("All content", new URL("/learn.md", base).href),
				mdLink("llms.txt", new URL("/llms.txt", base).href),
			]
				.map((l) => `- ${l}`)
				.join("\n")}`,
		],
	});
};
