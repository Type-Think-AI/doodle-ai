import rss from "@astrojs/rss";
import { SITE_TITLE, SITE_DESCRIPTION } from "../consts";
import { getArticleLinks } from "../lib/content/articles";

export async function GET(context) {
	const articles = await getArticleLinks();
	return rss({
		title: SITE_TITLE,
		description: SITE_DESCRIPTION,
		site: context.site,
		// `article.url` is the keyword-first path, e.g. /photo-to-cartoon/ —
		// derived from the content directory structure, never hardcoded.
		items: articles.map((article) => ({
			title: article.title,
			description: article.description,
			pubDate: article.pubDate,
			link: article.url,
			categories: [article.category, article.cluster],
		})),
	});
}
