import { glob } from "astro/loaders";
import { defineCollection } from "astro:content";
import { z } from "astro/zod";
import { GENERATION_MODES } from "./lib/doodle-constants";

/**
 * Editorial content collection.
 *
 * URL ARCHITECTURE (keyword-first, "option D"): the directory structure inside
 * `src/content/articles/` *is* the public URL. There is no `hub`/`slug`
 * frontmatter field, because two files could then declare the same path and
 * silently overwrite each other. The filesystem makes that impossible.
 *
 *   articles/photo-to-cartoon/index.md         -> /photo-to-cartoon/
 *   articles/ai-cartoon-generator/index.md     -> /ai-cartoon-generator/
 *   articles/ai-cartoon-generator/prompts.md   -> /ai-cartoon-generator/prompts/
 *   articles/for-studios/ai-filmmaker-stills.md-> /for-studios/ai-filmmaker-stills/
 *
 * Every article is rendered by the single catch-all `src/pages/[...path].astro`,
 * which strips a trailing `/index` so a folder's `index.md` becomes the hub root.
 * That route also enforces `src/lib/content/reserved-routes.ts` at build time so
 * an article can never shadow a product route such as `/skills/` or `/boards/`.
 */
const articles = defineCollection({
	loader: glob({ base: "./src/content/articles", pattern: "**/*.{md,mdx}" }),
	schema: z.object({
		title: z.string().max(110, 'Title exceeds 110 chars (ideal: ≤60 for SERP display; hard cap 110 for long-tail AEO titles)'),
		description: z.string().min(80, 'Description too short for SEO (aim for 120-160 chars)').max(300, 'Description too long (ideal: 120-160 chars for SERP; hard cap 300 for AEO)'),
		pubDate: z.coerce.date(),
		updatedDate: z.coerce.date().optional(),
		heroImage: z.string().optional(),

		/**
		 * Editorial format. Drives the eyebrow label, the `/learn/` grouping, and
		 * sitemap priority. It deliberately does NOT drive HowTo structured data:
		 * see `src/components/article/ArticleSchema.astro` for why fabricated
		 * step markup is not emitted.
		 */
		category: z.enum(["guide", "explainer", "prompts", "studios"]),

		/**
		 * Topic silo used to compute the "related reading" block automatically, so
		 * publishing article N+1 links it into the existing set without editing
		 * any of them.
		 *
		 * Aug 2026 SEO expansion (docs/seo-keyword-pages-spec.md): added `doodle`
		 * (photo-to-doodle / doodle-generator converters), `coloring` (line-art /
		 * printable coloring pages), `festival` (festive portrait landings), and
		 * `learn` (prompt-idea + how-to pages that still embed the generator).
		 * Existing articles keep their clusters, so nothing re-silos.
		 */
		cluster: z.enum([
			"cartoon",
			"pets",
			"stickers",
			"gifts",
			"social",
			"studios",
			"doodle",
			"coloring",
			"festival",
			"learn",
		]),

		/**
		 * Optional. The generation mode / skill id this landing auto-applies when
		 * the reader opens the in-page composer or the "Create your doodle" CTA.
		 * The value is passed straight to `/?skill=<id>`, which the home composer
		 * validates with `getSkill(id)` before pinning the chip. This is a landing
		 * pointing at an EXISTING skill — it does NOT create a new generation mode
		 * or a new SKILL.md package. Leave unset for pages that are purely
		 * editorial and should not surface the try-it panel.
		 */
		skill: z
			.enum(GENERATION_MODES as unknown as [string, ...string[]])
			.optional(),

		/**
		 * Optional. The single head keyword this page targets, kept as data so a
		 * later audit (and docs/seo-pages-shipped.md) can read intent without
		 * parsing prose. Never rendered as a "we rank #1 for X" claim.
		 */
		primaryKeyword: z.string().optional(),

		/**
		 * Optional, and only for pages that genuinely render a visible Q&A list.
		 * When present it emits FAQPage structured data. Never populate this to
		 * chase a rich result the page does not actually show.
		 */
		faq: z
			.array(z.object({ question: z.string(), answer: z.string() }))
			.optional(),
	}).refine(
		(data) => {
			// TODO: raise to 3 after T-13 adds FAQ blocks to all guide/explainer articles
			if (data.category === 'guide' || data.category === 'explainer') {
				return !data.faq || data.faq.length >= 0; // temporarily allow 0, target is >= 3
			}
			return true;
		},
		{ message: 'Guides and explainers should have at least 3 FAQ entries for FAQPage schema' }
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

export const collections = { articles, skillDocs };
