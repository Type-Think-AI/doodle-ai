import type { APIContext } from 'astro';

export const prerender = false;

// robots.txt — allow public pages, disallow API routes, point to sitemap.
export function GET(context: APIContext) {
	const site = context.site ?? new URL('https://doodleai.art');
	const body = `User-agent: *
Allow: /
Disallow: /api/

Sitemap: ${new URL('sitemap.xml', site).href}
`;
	return new Response(body, {
		headers: { 'Content-Type': 'text/plain; charset=utf-8' },
	});
}
