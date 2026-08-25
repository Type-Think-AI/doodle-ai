import { glob } from "astro/loaders";
import { defineCollection } from "astro:content";
import { z } from "astro/zod";

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
 * an article can never shadow a product route such as `/skills/` or `/team/`.
 */
const articles = defineCollection({
	loader: glob({ base: "./src/content/articles", pattern: "**/*.{md,mdx}" }),
	schema: z.object({
		title: z.string(),
		description: z.string(),
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
		 */
		cluster: z.enum(["cartoon", "pets", "stickers", "gifts", "social", "studios"]),

		/**
		 * Optional, and only for pages that genuinely render a visible Q&A list.
		 * When present it emits FAQPage structured data. Never populate this to
		 * chase a rich result the page does not actually show.
		 */
		faq: z
			.array(z.object({ question: z.string(), answer: z.string() }))
			.optional(),
	}),
});

export const collections = { articles };
