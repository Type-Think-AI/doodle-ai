/* The editorial link graph: one flat list of links, shared by the sitemap, the
 * /learn/ index, related reading, breadcrumbs, RSS and the agent endpoints.
 *
 * Every function here reads BOTH editorial collections through
 * `getEditorialEntries()`. That is not incidental: prompt pages moved into their
 * own collection while keeping their existing root URLs, so anything that reads
 * only `articles` would drop four indexed pages out of the sitemap, the /learn/
 * index and the related-reading graph — building cleanly the whole time. See
 * src/lib/content/editorial.ts for the full argument.
 *
 * The file keeps its name and its exports, including the CATEGORY_* maps it now
 * re-exports from ./taxonomy.ts, so the ten or so importers did not have to
 * change when the collection split landed.
 */
import { idToPath } from "./reserved-routes";
import { entryCategory, getEditorialEntries, type EditorialEntry } from "./editorial";
import {
	CATEGORY_BLURB,
	CATEGORY_LABEL,
	CATEGORY_ORDER,
	type Category,
	type Cluster,
} from "./taxonomy";

export type { ArticleCategory, Category, Cluster } from "./taxonomy";
export {
	ARTICLE_CATEGORIES,
	CATEGORY_BLURB,
	CATEGORY_LABEL,
	CATEGORY_ORDER,
	CATEGORY_PRIORITY,
	CLUSTERS,
} from "./taxonomy";

/** An entry from either editorial collection. Kept for existing importers. */
export type Article = EditorialEntry;

export interface ArticleLink {
	path: string;
	url: string;
	title: string;
	description: string;
	category: Category;
	cluster: Cluster;
	pubDate: Date;
	updatedDate?: Date;
	heroImage?: string;
	/** Bound generation-mode id. Always set on a `tool` page (schema-enforced). */
	skill?: string;
	/** The single head keyword this page targets, used as the short nav label. */
	primaryKeyword?: string;
}

function toLink(entry: EditorialEntry): ArticleLink {
	const path = idToPath(entry.id);
	return {
		path,
		url: `/${path}/`,
		title: entry.data.title,
		description: entry.data.description,
		// Injected from the collection for a prompt page, which carries no
		// `category` field — see `entryCategory`.
		category: entryCategory(entry),
		cluster: entry.data.cluster,
		pubDate: entry.data.pubDate,
		updatedDate: entry.data.updatedDate,
		heroImage: entry.data.heroImage,
		skill: entry.data.skill,
		primaryKeyword: entry.data.primaryKeyword,
	};
}

/** Every editorial page — articles AND prompts — as a flat link list, newest first. */
export async function getArticleLinks(): Promise<ArticleLink[]> {
	const entries = await getEditorialEntries();
	return entries
		.map(toLink)
		.sort((a, b) => b.pubDate.valueOf() - a.pubDate.valueOf());
}

/**
 * Editorial pages grouped by format, in CATEGORY_ORDER.
 *
 * The `prompts` group is still populated here even though prompt pages are no
 * longer articles: dropping them would orphan four indexed URLs from /learn/,
 * which is their main internal-link source.
 */
export async function getArticlesByCategory(): Promise<
	{ category: Category; label: string; blurb: string; items: ArticleLink[] }[]
> {
	const links = await getArticleLinks();
	return CATEGORY_ORDER.map((category) => ({
		category,
		label: CATEGORY_LABEL[category],
		blurb: CATEGORY_BLURB[category],
		items: links.filter((l) => l.category === category),
	})).filter((group) => group.items.length > 0);
}

/**
 * Every `category: "tool"` page — the free-tool screens.
 *
 * ONE source for the /tools/ hub, the navbar, the footer column and the sitemap,
 * so converting a page (a single frontmatter line) makes it appear in all four
 * without anyone editing a hand-written list. A hard-coded footer array is
 * exactly how these things drift: batch 2 and 3 would silently ship unlinked.
 *
 * Sorted by title so the hub reads alphabetically rather than by publish date —
 * these are tools, not posts, and every one of them was published on the same day.
 */
export async function getToolLinks(): Promise<ArticleLink[]> {
	const links = await getArticleLinks();
	return links
		.filter((l) => l.category === "tool")
		.sort((a, b) => a.title.localeCompare(b.title));
}

/**
 * Tool pages grouped by the skill that powers them, which is the only grouping
 * that tells a visitor something they cannot already see from the title. Seven
 * coloring URLs powered by one skill is a fact worth surfacing, not hiding.
 */
export async function getToolsBySkill(): Promise<{ skill: string; items: ArticleLink[] }[]> {
	const tools = await getToolLinks();
	const bySkill = new Map<string, ArticleLink[]>();
	for (const tool of tools) {
		const key = tool.skill ?? "other";
		const bucket = bySkill.get(key);
		if (bucket) bucket.push(tool);
		else bySkill.set(key, [tool]);
	}
	// Largest group first — that is where a browsing visitor has most to choose from.
	return [...bySkill.entries()]
		.map(([skill, items]) => ({ skill, items }))
		.sort((a, b) => b.items.length - a.items.length);
}

/**
 * Related reading for one article, computed rather than hand-maintained:
 *
 * 1. same cluster first (a pet article pulls the other pet articles),
 * 2. then the same hub prefix (`/ai-cartoon-generator/prompts/` pulls its hub),
 * 3. then newest articles from other clusters to fill the slots.
 *
 * This is why publishing article #11 links itself into the existing ten without
 * editing any of their markdown.
 */
export async function getRelatedArticles(current: string, limit = 3): Promise<ArticleLink[]> {
	const links = await getArticleLinks();
	const self = links.find((l) => l.path === current);
	if (!self) return links.slice(0, limit);

	const others = links.filter((l) => l.path !== current);
	const hub = current.split("/")[0];

	const sameCluster = others.filter((l) => l.cluster === self.cluster);
	const sameHub = others.filter((l) => l.path.split("/")[0] === hub && !sameCluster.includes(l));
	const rest = others.filter((l) => !sameCluster.includes(l) && !sameHub.includes(l));

	return [...sameCluster, ...sameHub, ...rest].slice(0, limit);
}

/** Children of a hub, e.g. /ai-cartoon-generator/ -> its /prompts/ child. */
export async function getHubChildren(hubPath: string): Promise<ArticleLink[]> {
	const links = await getArticleLinks();
	return links.filter((l) => l.path !== hubPath && l.path.startsWith(`${hubPath}/`));
}

/** Breadcrumb trail for an article path. The hub row is only linked if it exists. */
export async function getBreadcrumbs(
	path: string,
	title: string,
): Promise<{ name: string; url?: string }[]> {
	const trail: { name: string; url?: string }[] = [{ name: "Home", url: "/" }];
	const segments = path.split("/");

	if (segments.length > 1) {
		const hubPath = segments[0];
		const links = await getArticleLinks();
		const hub = links.find((l) => l.path === hubPath);
		trail.push({
			name: hub?.title ?? hubPath.replace(/-/g, " "),
			url: `/${hubPath}/`,
		});
	}

	trail.push({ name: title });
	return trail;
}
