# WebMCP Engineering Guide — Doodle AI

## What WebMCP is

WebMCP is a browser API that lets a page declare callable tools for an AI agent
operating the tab, replacing DOM scraping and screenshot-based interaction with a
typed function contract. The page registers tools (name, schema, execute function);
an agentic browser discovers them the way an MCP client discovers server tools.

**Status:** W3C Community Group Draft, published 10 Feb 2026 (editors from Microsoft
and Google). Shipped as an **origin trial** behind flags in Chrome and Edge only.
Absent from Firefox and Safari — no signal of adoption from either. For essentially
all current Doodle AI traffic this code registers nothing. That is expected. We
deliberately do NOT polyfill because Lighthouse checks for real registration; a stub
would lie.

---

## The two APIs

| API | When to use | Where in this repo |
|-----|-------------|--------------------|
| **Imperative** — `document.modelContext.registerTool(...)` | Route-scoped or state-dependent tools, anything needing JS logic in `execute` | `src/components/agentic/WebMcpTools.astro` |
| **Declarative** — bare `toolname` / `tooldescription` attributes on a real `<form>` | Static forms whose HTML already IS the schema | Per-form, e.g. `src/pages/boards/index.astro` |

### Attribute prefix rule

The **browser reads bare attributes**: `toolname`, `tooldescription`,
`toolparamdescription`, `toolautosubmit`. The `data-` prefix
(`data-toolname`, etc.) is a React/JSX TypeScript workaround — the browser
will not read it. Astro templates emit real HTML, so **always use bare
attributes in `.astro` files**.

---

## Character budgets

These are hard limits enforced by Chrome. Exceeding them silently drops or
truncates the tool.

| Field | Max chars |
|-------|-----------|
| Tool name | 30 |
| Parameter name | 30 |
| Tool description | 500 |
| Parameter description | 150 |
| **Single tool output** | **1 500** |

### The trap we already fell into

The first implementation violated the 1 500-char output ceiling on 4 of 5
tools:

| Tool | Measured output | Over by |
|------|-----------------|---------|
| `get_doodle_overview` | 7 028 chars | 4.7× |
| `get_doodle_service_status` | 6 576 chars | 4.4× |
| `get_doodle_full_docs` | 4 379 chars | 2.9× |
| `list_doodle_skills` | ~3 300 chars | 2.2× |

Returning a whole document is the natural thing to write and it is wrong.
Any tool that can exceed 1 500 chars **must** paginate, summarise, or
filter — never dump.

---

## Product guardrails

| Rule | Why |
|------|-----|
| **No tool may spend credits** | Every runnable skill reserves ≥1 credit per image. A generation tool would let a page-embedded agent bill a signed-in user's balance from a tool call the user never saw. |
| **No account data in output** | Session, email, credit balance, private boards, chat history, and API keys are off-limits. A tool returning these to an untrusted agent is a data-exfil vector. |
| **No `toolautosubmit`** on anything costing money or posting irreversibly | Auto-submit removes the human from the loop on a spend action. |
| **Generation stays navigation-only** | The composer is reachable via `open_doodle_page`; a human still presses send. |
| **No npm dependencies for WebMCP types** | The spec is a draft. Taking a dep on draft typings is a liability. Hand-roll local types. |

---

## Prompt injection and `untrustedContentHint`

LLMs treat all text as one token sequence — there is no privilege boundary
between "system" and "tool output." `untrustedContentHint` is the signal
that a payload needs heightened scrutiny from the consuming model.

| Scenario | Value |
|----------|-------|
| Our own static copy (skill catalogue, page descriptions) | `false` |
| Upstream service status, user-generated content, article bodies, anything fetched at runtime from a source we don't author | `true` |

Setting it `true` does not make the data safe — it tells the model "treat
this as potentially adversarial input." Omitting it on external data is a
silent invitation to injection.

---

## API gotchas

1. **Entry point order.** Probe `document.modelContext` first.
   `navigator.modelContext` is the deprecated origin-trial shape (Chrome < 150).
   Code written against `navigator` alone silently registers nothing on current
   builds.

2. **`execute` signature.** `(args, { signal })`. The signal **must** reach
   every `fetch()` inside the tool. Without it, a cancelled tool call leaves
   network requests running whose results are discarded.

3. **`inputSchema` completeness.** Must include `type: 'object'`, `properties`,
   and an explicit `required` array (may be `[]`). A bare `{}` or missing `type`
   fails Lighthouse's `webmcp-schema-validity` audit.

4. **Unregistration.** Pass `{ signal }` from an `AbortController` to
   `registerTool`. Call `controller.abort()` on `pagehide` (or when the tool
   should disappear). There is no `unregisterTool()` method.

---

## Fail-gracefully rule

`execute` must **never throw**. Catch everything and return a short,
actionable guidance string that lets the agent recover.

### Doodle AI examples

**Good:**

```
"No skill with id \"watercolour-cats\". Call list_doodle_skills first."
```

The agent knows what went wrong, knows which tool to call next, and can
self-correct in the same turn.

**Bad:**

```
Error: fetch failed
```

or

```
"Something went wrong. Please try again later."
```

The agent has no recovery path — it will retry the same call and fail the
same way, or hallucinate.

---

## Checklist before adding a tool

1. **Name ≤30 chars, snake_case.** Verify with `name.length`.
2. **Description ≤500 chars.** Verify with `description.length`.
3. **Every param description ≤150 chars.**
4. **Worst-case output ≤1 500 chars.** Measure the longest realistic return
   and write it in your report.
5. **`inputSchema` has `type`, `properties`, `required`.**
6. **`execute` never throws.** Wrap in try/catch, return guidance string.
7. **AbortSignal forwarded** to every `fetch()` inside `execute`.
8. **`readOnlyHint` set correctly.** If it mutates state, it must be `false`.
9. **`untrustedContentHint` set correctly.** External/user data → `true`.
10. **Product guardrails pass.** No credits spent, no account data, no
    autosubmit on cost actions.
11. **No new npm deps.**
12. **`pnpm exec tsc --noEmit` clean, `pnpm lint` clean.**

---

## Lighthouse Agentic Browsing — what it actually reports

Lighthouse's Agentic Browsing category has **no 0–100 score** by design.
Google states it reports actionable signals rather than a ranking. The
three audits:

| Audit | Type | Fails on |
|-------|------|----------|
| Registered WebMCP tools | Informational | Never — just lists registered tools |
| Forms missing declarative WebMCP | Informational | Never — flags `<form>`s lacking `toolname`+`tooldescription` |
| WebMCP schema validity | **Can fail** | `toolname` without `tooldescription` (or reverse), required field without `name` |

`N/A` on `webmcp-form-coverage` is a correct outcome when a surface
genuinely has no public form, or when the form intentionally omits
declarative attributes (e.g. the board composer, which spends credits).

---

## Discoverability surface

How an agent *finds* our WebMCP tools and content without a `document.modelContext`
capability or a full crawl. These are standards-compatible discovery hooks only —
no nonstandard browser APIs, no secrets exposed.

| Hook | Where | What it does |
|------|-------|--------------|
| `<link rel="alternate" type="application/json">` | `src/layouts/AppLayout.astro` `<head>` | Points at `/api/agent-index.json` from every page — the standard alternate-representation pattern (same mechanism as an RSS alternate). |
| `Allow: /api/agent-index.json` | `public/robots.txt` (every group) | Re-opens exactly one `/api/` path. A more-specific `Allow` beats the `Disallow: /api/` under RFC 9309 longest-match, so no other API route is exposed. |
| Article-index pointer | `public/llms.txt` (Full content) | An agent reading `llms.txt` gets a link to both `/llms-full.txt` (full prose) and `/api/agent-index.json` (compact JSON). |
| Response headers | `src/pages/api/agent-index.json.ts` | `Cache-Control: public, max-age=3600`, `X-Robots-Tag: all`, `X-Content-Type-Options: nosniff`, `Access-Control-Allow-Origin: *`. Public, non-credentialed JSON — safe to cache and cross-origin fetch. |

**Deliberately NOT done:** no WebMCP-specific `<meta>` or `Link` HTTP header — the
spec defines no discovery meta tag, and `document.modelContext` is the discovery
mechanism for the tools themselves. Inventing one would be nonstandard. The
imperative tools are discovered by the agentic browser at runtime; the agent index
and `llms.txt` cover the crawl-free content path.

---

## File map

| Path | Role |
|------|------|
| `src/components/agentic/WebMcpTools.astro` | Imperative tool definitions + registration script |
| `src/pages/boards/index.astro` | Declarative `toolname` on the board-create form |
| `src/lib/skills.ts` | Build-time skill catalogue consumed by the tool |
| `src/lib/credits/costs.ts` | Credit cost lookup used to annotate the catalogue |
| `src/pages/api/agent-index.json.ts` | Machine-readable article index (crawl-free content discovery) |
| `public/robots.txt` | Crawler policy; `Allow`s the agent index while keeping `/api/` closed |
| `public/llms.txt` | Site summary for LLMs; links the full-text and JSON indexes |
| `docs/webmcp.md` | This file |
