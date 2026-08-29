# WebMCP tool-expansion — shared lane brief

Read this before writing code. It is the contract every lane shares. Your own
task message names the ONE file you own and the tools you build.

## What we are building and why

WebMCP hands an AI agent a set of callable tools instead of making it scrape the
DOM. Google's WebMCP rules cap a **single tool output at 1,500 characters**.
Our 10 editorial articles are **5,278–7,032 words each (~37,000 chars)**, with
13–19 `##` sections. The existing `get_doodle_article` returns the first ~1,400
chars and stops, so an agent can read about **4% of an article** and has no way
to reach the rest. This wave fixes that by making content navigable in
budget-sized pieces, and adds the discovery, skill and site-map tools around it.

## Read these first

- `src/components/agentic/tools-content.ts` — the `WebMcpToolDef` interface, the
  `clip()`/`HARD_CAP` budgeting pattern, the never-throw guidance-string
  pattern, `AbortError` handling, off-origin refusal. **Copy these patterns.**
  Declare your own local helpers; do not import private ones across lanes.
- `src/components/agentic/registry.ts` — `ToolBundle`, the route matchers
  (`always`, `exact`, `prefix`, `isArticle`, `isSkillPage`, `either`, `not`),
  and `EXCLUDED_PREFIXES` / `PRODUCT_PREFIXES`.

## Hard rules — non-negotiable

- Tool name **≤30 chars**, `snake_case`. Description **≤500 chars**. Each
  parameter description **≤150 chars**.
- **Single tool output ≤1,500 chars, enforced BY CONSTRUCTION**: a `cap()` /
  `clip()` call must be the LAST thing applied to every return value, so no data
  shape can breach the ceiling. Never "return everything and hope it is small".
- `inputSchema` is a complete JSON Schema:
  `{ type: 'object', properties: { … }, required: [ … ] }`.
  `required` is **always an array**, even when empty. A bare `{}` or a missing
  `type` fails Lighthouse's `webmcp-schema-validity` audit.
- `execute` signature:
  `(args: Record<string, unknown>, context?: { signal?: AbortSignal }) => Promise<string>`
- `execute` returns a **PLAIN STRING**. Do **not** return `{ content: [...] }` —
  the MCP content envelope is applied centrally by `withTextEnvelope()` at the
  registration site. Returning it yourself double-wraps.
- **Never throw.** Every failure path returns a short, actionable guidance
  string that names the tool to call next, e.g.
  `'No article at "/x/". Call list_doodle_articles first.'` A thrown error gives
  an agent nothing to act on.
- Forward `context.signal` into **every** `fetch()`. Handle `AbortError`
  explicitly and return `'…was cancelled.'`
- Resolve same-origin URLs with `new URL(path, window.location.origin)` and
  **refuse off-origin input** — a page-embedded agent must not use our tools to
  fetch arbitrary sites.
- `annotations`: `readOnlyHint: true` for everything in this wave.
  `untrustedContentHint: true` whenever the return value contains editorial body
  text or third-party data; `false` for first-party structural metadata.

## Safety — absolute

Expose **nothing** that generates an image, uploads, or spends credits. Every
runnable skill costs at least 1 credit per image, so a generation tool would let
whatever is driving the browser bill a signed-in user. Generation stays
reachable by **navigation only**, so a human presses send.

Never advertise or register on `/admin/**` (staff only), `/s/<token>` or
`/join/<token>` (unauthenticated token surfaces reachable by anyone with the
link). `EXCLUDED_PREFIXES` in `registry.ts` is the source of truth — import and
filter against it rather than hardcoding a second list that can drift.

## Export shape

Default-export one bundle. Wiring into the page is the orchestrator's job in
`WebMcpTools.astro` — you never edit that file.

```ts
import { type ToolBundle, always } from './registry';

const bundle: ToolBundle = {
  id: 'your-lane-id',
  appliesTo: always,          // or prefix('/skills'), isArticle, …
  tools: [ /* … */ ],
};
export default bundle;
```

Prefer `always` only for tools useful site-wide. Chrome's guidance is per-route
registration: a longer global tool list measurably lowers agent tool-selection
accuracy, so scope specialist tools to their route.

## Data sources

**Exists today.** `GET /api/agent-index.json`

```json
{ "generatedAt": "ISO", "count": 10,
  "articles": [ { "url": "/photo-to-cartoon/", "title": "…", "description": "…",
                  "category": "guide", "pubDate": "2026-08-25",
                  "updatedDate": "2026-08-25", "excerpt": "…" } ] }
```

**Being built in parallel by Lane A against this FROZEN contract.** Code against
it, do not implement it, and degrade with a guidance string on non-200.

`GET /api/agent/articles.json` — the cheap index, no section bodies:

```json
{ "generatedAt": "ISO", "count": 10,
  "articles": [ { "url": "/photo-to-cartoon/", "title": "…", "description": "…",
                  "category": "guide", "cluster": "cartoon",
                  "pubDate": "2026-08-25", "updatedDate": "2026-08-25",
                  "wordCount": 5628, "sectionCount": 15, "hasFaq": false,
                  "sections": [ { "slug": "what-you-need", "title": "What you need" } ] } ] }
```

`GET /api/agent/article.json?path=/photo-to-cartoon/` — one article in full:

```json
{ "url": "/photo-to-cartoon/", "title": "…", "description": "…",
  "category": "guide", "cluster": "cartoon", "pubDate": "2026-08-25",
  "updatedDate": "2026-08-25", "wordCount": 5628,
  "faq": [ { "question": "…", "answer": "…" } ],
  "sections": [ { "slug": "what-you-need", "title": "What you need",
                  "depth": 2, "index": 0, "chars": 2140, "text": "plain text…" } ] }
```

## Content facts

- 10 articles, ~60,700 words total. Categories: `guide` | `explainer` |
  `prompts` | `studios`. Clusters: `cartoon` | `pets` | `stickers` | `gifts` |
  `social` | `studios`.
- **Only 2 of 10 articles have `faq` frontmatter** (`ai-cartoon-generator`,
  `photo-to-sticker`). Any FAQ tool must behave well on the other 8: say plainly
  there is no FAQ and offer the section outline instead.
- `/ai-cartoon-generator/prompts/` is a prompt library (category `prompts`) and
  is a distinct asset from prose guides.
- 22 skills. Metadata is owned by `src/lib/skills.ts` / `src/lib/skill-loader.ts`;
  credit cost comes from `imageCountForSkill` in `src/lib/credits/costs.ts`.
- Article URLs are keyword-first and derived from directory structure, served by
  the catch-all `src/pages/[...path].astro`. So "is this an article?" is answered
  by elimination against `PRODUCT_PREFIXES`, not by a path prefix.

## Route inventory (verified, public unless noted)

`/` chat composer — generation spends credits, human presses send ·
`/skills/`, `/skills/<id>` ×22 · `/learn/` · 10 keyword-first article URLs ·
`/about` · `/for-studios/` · `/status` · `/boards`, `/b/<id>` (sign-in) ·
`/c/<id>` (sign-in) · `/roadmap/`, `/roadmap/public` · `/projects/`,
`/projects/<id>` (sign-in) · `/team/`, `/team/settings` (sign-in) · `/settings`
(sign-in) · `/characters` · `/moodboards` · `/privacy-policy` ·
`/terms-of-service` (`/privacy` and `/terms` are 308 redirects — advertise only
the canonical targets) · `/404` · `/admin/**` ×11 **excluded**.

## Validation you must do

```bash
cd /Users/yash/Projects/doodle-ai
pnpm exec tsc --noEmit 2>&1 | grep <your-file>     # must be clean
```

Pre-existing errors in files you do not own are not yours to fix. Then assert
your own budgets with a throwaway node script — print every tool name, its
description length, and every parameter description length, and fail loudly on
any breach of 30 / 500 / 150. Delete the throwaway afterwards.

Dev server: `curl -s -o /dev/null -w '%{http_code}' http://localhost:4321/` — if
that is not `200`, start it with `pnpm dev:local` in the background.

## Report back

Tool names with name/description char counts, the worst-case output length you
measured (not guessed), and anything you could not verify.
