import type { APIRoute } from "astro";
import type { CollectionEntry } from "astro:content";

/**
 * `<article-url>.md` — a clean Markdown view of every editorial page.
 *
 * WHY: AI crawlers, chat assistants and coding agents fetch pages as text. Handed
 * HTML they spend their context window on our nav, footer, scripts and inline
 * SVGs before reaching a sentence of prose; several now probe for a `.md` sibling
 * (or send `Accept: text/markdown`) and use it when present. `/llms.txt` is the
 * MAP of the site — these are the clean documents that map should point at.
 *
 * WHY NOT AN INTEGRATION: the obvious candidates (astro-slop, astro-mark-don,
 * astro-llms-md) all centre on converting rendered HTML back into Markdown. Our
 * content is ALREADY Markdown in a content collection, so a round-trip through
 * HTML would only lose fidelity, and the most complete of them still requires a
 * hand-written endpoint per route — which is this file. astro-slop additionally
 * shares state via `globalThis[Symbol.for(...)]` and warns that worker runtimes
 * may need a different mechanism; this project deploys to Cloudflare Workers.
 *
 * `getStaticPaths` is re-exported from the HTML route rather than re-derived, so
 * the two can never disagree about which URLs exist — and the reserved-route
 * collision check in that function keeps protecting both. Astro's module cache
 * means the underlying `getCollection` query still runs once per build.
 *
 * Route shape: `[...path].md.ts` emits `/photo-to-cartoon.md` for the page at
 * `/photo-to-cartoon/`, which is the convention crawlers guess.
 *
 * `getStaticPaths` mirrors the HTML route by reusing the SAME `idToPath` helper
 * rather than re-exporting the route's own function: `import ... from
 * "./[...path].astro"` type-checks as TS2307 under `tsc --noEmit` (TypeScript
 * cannot resolve `.astro`), and this project keeps that check clean. The URL
 * derivation is therefore shared code, and the reserved-segment collision guard
 * still runs from the HTML route, which fails the build before this one renders.
 */
import { getCollection } from "astro:content";
import { idToPath } from "../lib/content/reserved-routes";
import { markdownResponse, mdFrontmatter, resolveSite } from "../lib/markdown/page-md";

export async function getStaticPaths() {
  const entries = await getCollection("articles");
  return entries.map((entry) => {
    const path = idToPath(entry.id);
    return { params: { path }, props: { entry, path } };
  });
}

interface Props {
  entry: CollectionEntry<"articles">;
  path: string;
}

/**
 * Quote a value for a YAML double-quoted scalar. `JSON.stringify` is exactly
 * right here: YAML's double-quoted style uses the same `\"` / `\\` escapes, and
 * our titles and descriptions routinely contain colons and apostrophes that
 * would otherwise produce an unparseable frontmatter block.
 */
function isoDay(date: Date): string {
  return date.toISOString().split("T")[0]!;
}

export const GET: APIRoute<Props> = ({ props, site }) => {
  const { entry, path } = props;
  const data = entry.data;
  const base = resolveSite(site);
  const canonical = new URL(`/${path}/`, base).href;

  /* Frontmatter is emitted rather than passed through: the collection's own
     frontmatter carries build concerns (heroImage, cluster internals) while an
     agent needs the citable URL, which never appears in the source file. */
  const frontmatter = mdFrontmatter({
    title: data.title,
    description: data.description,
    url: canonical,
    category: data.category,
    cluster: data.cluster,
    primary_keyword: data.primaryKeyword,
    skill: data.skill,
    published: isoDay(data.pubDate),
    updated: data.updatedDate ? isoDay(data.updatedDate) : undefined,
  });

  /* No article body starts with its own H1 (the layouts render the title), so
     the heading is added here to make the file a complete standalone document. */
  const body = (entry.body ?? "").trim();

  /* The FAQ lives in frontmatter and is rendered by the layout, so it is absent
     from `body` — yet it is the most directly answer-shaped content on the page.
     Appending it as real headings is what makes these files useful to an answer
     engine rather than just cheaper to parse. */
  const faq = data.faq?.length
    ? ["\n## Frequently asked questions\n", ...data.faq.map((item) => `### ${item.question}\n\n${item.answer}\n`)].join(
        "\n",
      )
    : "";

  const markdown = `${frontmatter}\n\n# ${data.title}\n\n${body}\n${faq}`;

  return markdownResponse(markdown, canonical);
};
