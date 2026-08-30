import type { APIContext } from 'astro';
import { SKILLS, getSkill } from '../lib/skills';
import { getToolLinks, getArticlesByCategory } from '../lib/content/articles';

export const prerender = true;

/**
 * The short, AI-facing site index served at /llms.txt.
 *
 * GENERATED, not hand-written. The old public/llms.txt was maintained by hand
 * and drifted: it missed the two newest skills and listed skill ids that no
 * longer resolve. Everything that can go stale is now derived at build time —
 * the skill catalogue from SKILLS (src/lib/skills.ts) and the page lists from
 * the content collection (src/lib/content/articles.ts) — so the file cannot
 * fall behind the product again.
 *
 * The prose sections (Product, Technical flow, Important boundaries, credit
 * facts) are still authored here verbatim, because they state behaviour no data
 * module models. The credit facts are copied from the previous static file and
 * must not be restated from memory.
 */
export async function GET(context: APIContext) {
  const site = context.site ?? new URL('https://doodleai.art');
  const abs = (path: string) => new URL(path, site).href;

  const runnable = SKILLS.filter((s) => s.runnable);
  const toolLinks = await getToolLinks();
  const byCategory = await getArticlesByCategory();

  // Editorial content = every non-tool article, newest first (getArticlesByCategory
  // is already in CATEGORY_ORDER; flatten but drop tools, which have their own section).
  const editorial = byCategory
    .filter((group) => group.category !== 'tool')
    .flatMap((group) => group.items);

  const skillLines = runnable
    .map((s) => `- [${s.name}](${abs(`/skills/${s.id}/`)}): ${s.tagline}`)
    .join('\n');

  const toolLines = toolLinks
    .map((t) => {
      const skill = t.skill ? getSkill(t.skill) : undefined;
      const bound = skill ? ` — ${skill.name} skill` : '';
      return `- [${t.title}](${abs(t.url)})${bound}`;
    })
    .join('\n');

  const editorialLines = editorial
    .map((a) => `- [${a.title}](${abs(a.url)}) — ${a.description}`)
    .join('\n');

  const body = `# Doodle AI

> Doodle AI is a conversational creative studio at https://doodleai.art that turns photos and ideas into playful, hand-drawn doodle avatars, collages, sticker sheets, mood captions, and gifts.

## Markdown versions
Every editorial page is also served as clean Markdown: append \`.md\` to its URL.
https://doodleai.art/cute-doodle/ is also https://doodleai.art/cute-doodle.md
- [Full content index, Markdown](https://doodleai.art/learn.md): every page, grouped by format, each entry linking its own .md
- Each HTML page advertises its twin via \`<link rel="alternate" type="text/markdown">\` in the head.
- The .md files carry frontmatter (title, description, canonical url, category, primary_keyword, skill) plus the page body and its FAQ.

## Product
- Sign in with Google to upload, generate, save, and sync work. Browsing is open; creation requires an account.
- New accounts receive a 10-credit signup grant. Single-image skills cost 1 credit; pack skills cost 1 credit per image they produce (Style Roll, Childhood Me, Emotional Modes, Seasonal Pack and Webtoon Caricature 4, Festival Pack 6, Expression Pack 9). Failed images are refunded.
- Users do not enter a PicX API key. Generation uses Doodle AI's server-owned PicX connection.
- Saved characters can be mentioned with @. Signed-in chats, characters, and moodboards sync across devices.

## Skills
${skillLines}

## Free tools
Single-purpose pages where the generator is the first thing on the page and the right skill is preselected. The hub is [/tools/](${abs('/tools/')}).
${toolLines}

## Technical flow
1. The signed-in browser sends a chat turn to \`/api/chat\`.
2. Photos are uploaded through \`/api/upload\` to PicX managed assets using the server-owned connection.
3. The Mastra agent selects a skill and calls the generation tool.
4. The tool reserves account credits, calls PicX, refunds failed attempts, and streams the result back as NDJSON events.
5. The browser renders the result. The user can save it to a moodboard or download it.

## Important boundaries
- Doodle AI is an Astro 5 application deployed to Cloudflare Workers.
- Better Auth sessions and Cloudflare D1/KV back the account and credit experience.
- Provider credentials remain server-side and are never accepted from the browser.
- User images are processed through PicX managed assets and generated media is hosted by PicX.

## Guides
- [Learn index](https://doodleai.art/learn/): every explainer and guide, newest first
- [About Doodle AI](https://doodleai.art/about/): what the product is and who builds it
- [Status](https://doodleai.art/status/): live health of the app and its upstream services
- [For studios](https://doodleai.art/for-studios/): commercial and higher-volume use

## Optional
- [Full text of every page](https://doodleai.art/llms-full.txt): the complete site as one
  Markdown document, generated at build time. Prefer this over crawling individual pages —
  it is always current, and it is the only export that includes the full article bodies.
- [Privacy policy](https://doodleai.art/privacy-policy/)
- [Terms of service](https://doodleai.art/terms-of-service/)

- Stripe checkout is not implemented. There is no paid credit pack yet.
- API routes, account settings, characters, moodboards, and private chats should not be treated as public documentation.
- Doodle AI is not doodleai.fun, InstaDoodle, LazyAvatar, or cartoonize.ai.

## Editorial content
Long-form guides live at keyword-first root URLs, not under a /blog/ prefix.
${editorialLines}

## Public pages
- [Skills](https://doodleai.art/skills/)
- [Free tools](https://doodleai.art/tools/)
- [Doodle Avatar](https://doodleai.art/skills/normal/)
- [About](https://doodleai.art/about/)
- [Learn](https://doodleai.art/learn/)
- [Privacy](https://doodleai.art/privacy-policy/)
- [Terms](https://doodleai.art/terms-of-service/)
- [Sitemap](https://doodleai.art/sitemap.xml)

## Full content
- [Full text index](/llms-full.txt) -- all article titles, URLs, dates, and descriptions in one file.
- [Article index (JSON)](/api/agent-index.json) -- the same articles as a compact machine-readable list (url, title, description, category, dates, excerpt), for filtering without crawling.
`;

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=86400',
    },
  });
}
