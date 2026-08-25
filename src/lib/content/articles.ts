import { getCollection, type CollectionEntry } from "astro:content";
import { idToPath } from "./reserved-routes";

export type Article = CollectionEntry<"articles">;
export type Category = Article["data"]["category"];
export type Cluster = Article["data"]["cluster"];

/** Human labels for the editorial formats. Used as the article eyebrow and on /learn/. */
export const CATEGORY_LABEL: Record<Category, string> = {
	guide: "Guide",
	explainer: "Explainer",
	prompts: "Prompts",
	studios: "For studios",
};

/** Order the categories appear in on /learn/, highest search intent first. */
export const CATEGORY_ORDER: readonly Category[] = ["guide", "explainer", "prompts", "studios"];

export const CATEGORY_BLURB: Record<Category, string> = {
	guide: "Step-by-step processes for one photo and one result.",
	explainer: "What a term actually means, and which job you have.",
	prompts: "Copyable prompt patterns for the runnable skills.",
	studios: "Production workflows for studios and filmmakers.",
};

/** Sitemap priority per format. Guides carry the highest commercial intent. */
export const CATEGORY_PRIORITY: Record<Category, string> = {
	guide: "0.8",
	explainer: "0.8",
	prompts: "0.7",
	studios: "0.6",
};

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
}

function toLink(entry: Article): ArticleLink {
	const path = idToPath(entry.id);
	return {
		path,
		url: `/${path}/`,
		title: entry.data.title,
		description: entry.data.description,
		category: entry.data.category,
		cluster: entry.data.cluster,
		pubDate: entry.data.pubDate,
		updatedDate: entry.data.updatedDate,
		heroImage: entry.data.heroImage,
	};
}

/** Every article as a flat link list, newest first. */
export async function getArticleLinks(): Promise<ArticleLink[]> {
	const entries = await getCollection("articles");
	return entries
		.map(toLink)
		.sort((a, b) => b.pubDate.valueOf() - a.pubDate.valueOf());
}

/** Articles grouped by editorial format, in CATEGORY_ORDER. */
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
