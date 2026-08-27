import type { APIContext } from 'astro';
import { getCollection } from 'astro:content';

export const prerender = true;

export async function GET(context: APIContext) {
  const site = context.site ?? new URL('https://doodleai.art');
  const articles = await getCollection('articles');

  const header = '# Doodle AI -- Full Content Index\n\n> All editorial content from https://doodleai.art for LLM ingestion.\n> See also: /llms.txt (short index)\n\n---\n\n';

  const sections = articles
    .sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf())
    .map((article) => {
      // article.id looks like "ai-cartoon-generator/index" or "for-studios/ai-filmmaker-stills"
      const path = article.id.replace(/\/index$/, '');
      const url = new URL(`/${path}/`, site).href;
      return [
        `## ${article.data.title}`,
        `URL: ${url}`,
        `Category: ${article.data.category} | Cluster: ${article.data.cluster}`,
        `Published: ${article.data.pubDate.toISOString().split('T')[0]}`,
        article.data.updatedDate ? `Updated: ${article.data.updatedDate.toISOString().split('T')[0]}` : null,
        '',
        article.data.description,
        '',
        '---',
      ].filter(Boolean).join('\n');
    })
    .join('\n\n');

  return new Response(header + sections, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=86400',
    },
  });
}
