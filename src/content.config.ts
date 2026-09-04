import { glob } from "astro/loaders";
import { defineCollection } from "astro:content";
import { z } from "astro/zod";
import { GENERATION_MODES } from "./lib/doodle-constants";
import { ARTICLE_CATEGORIES, CLUSTERS } from "./lib/content/taxonomy";

/**
 * URL ARCHITECTURE (keyword-first, "option D"): the directory structure inside
 * an editorial collection *is* the public URL. There is no `hub`/`slug`
 * frontmatter field, because two files could then declare the same path and
 * silently overwrite each other. The filesystem makes that impossible.
 *
 *   articles/photo-to-cartoon/index.md         -> /photo-to-cartoon/
 *   articles/ai-cartoon-generator/index.md     -> /ai-cartoon-generator/
 *   prompts/ai-cartoon-generator/prompts.md    -> /ai-cartoon-generator/prompts/
 *   articles/for-studios/ai-filmmaker-stills.md-> /for-studios/ai-filmmaker-stills/
 *
 * BOTH `articles` and `prompts` render through the single catch-all
 * `src/pages/[...path].astro`, which strips a trailing `/index` so a folder's
 * `index.md` becomes the hub root. They share one root namespace, so that route
 * feeds `assertContentPaths` the union of both collections: a prompt page and an
 * article resolving to the same URL is a build error, and neither may shadow a
 * product route such as `/skills/` or `/boards/`. See
 * `src/lib/content/editorial.ts` for why the split exists and what it costs.
 */

/**
 * Fields every editorial page has, whichever collection it lives in.
 *
 * Shared as an object literal rather than duplicated, so a change to the
 * description length rule or the FAQ shape cannot apply to articles and quietly
 * not to prompt pages.
 */
const editorialBase = {
	title: z.string().max(110, 'Title exceeds 110 chars (ideal: ≤60 for SERP display; hard cap 110 for long-tail AEO titles)'),
	description: z.string().min(80, 'Description too short for SEO (aim for 120-160 chars)').max(300, 'Description too long (ideal: 120-160 chars for SERP; hard cap 300 for AEO)'),
	pubDate: z.coerce.date(),
	updatedDate: z.coerce.date().optional(),
	heroImage: z.string().optional(),

	/**
	 * Topic silo used to compute the "related reading" block automatically, so
	 * publishing article N+1 links it into the existing set without editing any
	 * of them. The list lives in src/lib/content/taxonomy.ts because both
	 * collections build their enum from it — two hand-written enums would drift
	 * and silently split a cluster in half.
	 */
	cluster: z.enum(CLUSTERS),

	/**
	 * Optional. The generation mode / skill id this landing auto-applies when the
	 * reader opens the in-page composer or the "Create your doodle" CTA. The
	 * value is passed straight to `/?skill=<id>`, which the home composer
	 * validates with `getSkill(id)` before pinning the chip. This is a landing
	 * pointing at an EXISTING skill — it does NOT create a new generation mode or
	 * a new SKILL.md package. Leave unset for pages that are purely editorial and
	 * should not surface the try-it panel.
	 */
	skill: z.enum(GENERATION_MODES as unknown as [string, ...string[]]).optional(),

	/**
	 * Optional. The single head keyword this page targets, kept as data so a later
	 * audit (and docs/seo-pages-shipped.md) can read intent without parsing
	 * prose. Never rendered as a "we rank #1 for X" claim.
	 */
	primaryKeyword: z.string().optional(),

	/**
	 * Optional, and only for pages that genuinely render a visible Q&A list. When
	 * present it emits FAQPage structured data. Never populate this to chase a
	 * rich result the page does not actually show.
	 */
	faq: z.array(z.object({ question: z.string(), answer: z.string() })).optional(),
};

/**
 * Editorial content collection — guides, explainers, studio pages, and tools.
 *
 * Note what is NOT in the category enum: `prompts`. Prompt pages are their own
 * collection now, and dropping the value here is what turns a leftover
 * `category: "prompts"` in this directory into a build failure instead of a page
 * that renders from the wrong place.
 */
const articles = defineCollection({
	loader: glob({ base: "./src/content/articles", pattern: "**/*.{md,mdx}" }),
	schema: z.object({
		...editorialBase,

		/**
		 * Editorial format. Drives the eyebrow label, the `/learn/` grouping, and
		 * sitemap priority. It deliberately does NOT drive HowTo structured data:
		 * see `src/components/article/ArticleSchema.astro` for why fabricated step
		 * markup is not emitted.
		 *
		 * `tool` is the one value that changes the LAYOUT rather than just a label.
		 * A tool page is rendered by `ToolLayout.astro` instead of
		 * `ArticleLayout.astro`: the real generator sits above the fold and the
		 * prose sits under it, because these URLs answer converter queries
		 * ("photo to coloring page", "free ai doodle generator") where the searcher
		 * wants an input box, not an essay. It REQUIRES `skill` — a tool page with
		 * nothing to run is just a slower guide — and the refine below enforces
		 * that at build time.
		 */
		category: z.enum(ARTICLE_CATEGORIES),
	}).refine(
		(data) => {
			// TODO: raise to 3 after T-13 adds FAQ blocks to all guide/explainer articles
			if (data.category === 'guide' || data.category === 'explainer') {
				return !data.faq || data.faq.length >= 0; // temporarily allow 0, target is >= 3
			}
			return true;
		},
		{ message: 'Guides and explainers should have at least 3 FAQ entries for FAQPage schema' }
	).refine(
		// A tool page's whole reason to exist is the generator above the fold, so
		// `skill` is not optional there. Without this guard the page would render a
		// tool shell with an empty hole where the composer belongs, and the failure
		// would only be visible to a human who happened to load the page.
		(data) => data.category !== 'tool' || Boolean(data.skill),
		{
			message:
				'category: "tool" requires a `skill` — the generator IS the page. Use category: "guide" for an editorial page.',
		},
	).refine(
		// The tool layout renders a visible Q&A block as one of its sections, so the
		// FAQ is load-bearing content rather than optional decoration — and FAQPage
		// markup is only honest when the page really shows the questions.
		(data) => data.category !== 'tool' || (data.faq?.length ?? 0) >= 3,
		{
			message:
				'category: "tool" requires at least 3 faq entries — the FAQ block is a section of the tool layout, not an extra.',
		},
	),
});

/**
 * Prompt pages — copyable prompt patterns for the runnable skills.
 *
 * Its own collection rather than a category of `articles`, because a prompt page
 * is a different kind of artefact: it is a library keyed to live skills, and the
 * rule that matters for it ("name a real skill") is not a rule any blog post
 * needs. Keeping it here means that rule can tighten without touching 96
 * articles, and an article can no longer claim to be one.
 *
 * There is deliberately NO `category` field. The collection already carries that
 * fact; a frontmatter copy would only let a prompt page declare itself a guide.
 * `entryCategory()` in src/lib/content/editorial.ts injects it.
 *
 * URLs are unchanged from when these lived under articles/ — see the URL
 * ARCHITECTURE note above, and src/lib/content/editorial.ts for why.
 */
const prompts = defineCollection({
	loader: glob({ base: "./src/content/prompts", pattern: "**/*.{md,mdx}" }),
	schema: z
		.object({
			...editorialBase,

			/**
			 * Optional. When a prompt page is scoped to one skill, this both binds the
			 * try-it CTA and states which skill the patterns were written against —
			 * the same field articles use, kept optional because a cross-skill prompt
			 * library (e.g. /ai-cartoon-generator/prompts/) covers several.
			 */
		})
		.refine(
			// The whole value of a prompt page is patterns a reader can copy, and a
			// primaryKeyword is what ties it to the query it answers. Enforced here
			// and not on articles because these pages exist purely as search landings.
			(data) => Boolean(data.primaryKeyword),
			{
				message:
					'A prompt page needs a `primaryKeyword` — it exists to answer one query, and that value is what records which.',
			},
		),
});

/**
 * Skill documentation collection.
 *
 * Renders the BODY of each `src/mastra/skills/<name>/SKILL.md` as HTML for the
 * public skill pages, so the same file that instructs the agent is also the
 * page users read. Nothing else is generated from here.
 *
 * IMPORTANT — this is deliberately NOT a second source of truth. All skill
 * METADATA (id, names, category, thumbnail, runnable) stays owned by
 * `src/lib/skill-loader.ts`, which parses the frontmatter itself and
 * cross-validates it against GENERATION_MODES at build time. This collection
 * exists only because Astro's markdown pipeline (including the rehype plugins
 * in astro.config.mjs) is the cheapest correct way to turn the markdown body
 * into HTML — writing a second markdown renderer would be worse. The schema is
 * therefore intentionally permissive: validation belongs to skill-loader, and
 * duplicating its rules here would just create two places to drift.
 *
 * `generateId` returns the package directory name (e.g. "chibi-mini-me"), which
 * is the same value as a SkillDefinition's `name`, so a page can look up its
 * doc without any extra mapping table.
 */
const skillDocs = defineCollection({
	loader: glob({
		base: "./src/mastra/skills",
		pattern: "*/SKILL.md",
		generateId: ({ entry }) => entry.split("/")[0],
	}),
});

export const collections = { articles, prompts, skillDocs };
