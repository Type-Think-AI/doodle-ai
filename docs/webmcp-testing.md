# WebMCP testing — the three layers

Doodle AI exposes a [WebMCP](https://webmachinelearning.github.io/webmcp/) tool
surface so an agentic browser can act through **callable tools** instead of
scraping the DOM. That surface is client-side script and declarative form
attributes — nothing in the normal build, `tsc`, or unit tests ever runs it
inside a browser that exposes `document.modelContext`, so a regression ships
silently. Three complementary layers close that gap, each answering a different
question.

| Layer | Script / surface | Question it answers | Needs an LLM? |
|---|---|---|---|
| **1. Protocol conformance** | `scripts/webmcp-smoke.mjs` | Are the tools *registered, valid, budgeted, and executable* in a real Canary? | No |
| **2. Autonomous agent behaviour** | `scripts/webmcp-agent-eval.mjs` | Given *only* the tool metadata, can a real agent *accomplish tasks*? | Yes (deterministic fallback without one) |
| **3. Interactive human QA** | the browser extension | Does a *human* driving an agent through the tools get sensible results? | Yes (user-supplied) |

The layers are ordered by how much they assume. The smoke test assumes nothing
about intelligence — it checks the wiring. The agent eval assumes a model and
checks whether the *tools alone* are enough for it to succeed. The extension
puts a human in the loop for exploratory QA the first two cannot script.

---

## Layer 1 — protocol conformance (`webmcp-smoke.mjs`)

Drives Chrome Canary over CDP, loads the live page, and asserts:

- `document.modelContext` exists and exposes `getTools()`;
- all seven imperative tools are registered
  (`list_doodle_skills`, `get_doodle_skill`, `get_doodle_overview`,
  `get_doodle_status`, `open_doodle_page`, `search_doodle_articles`,
  `get_doodle_article`);
- each tool's `name`, `description`, and `inputSchema` are within Google's
  authoring budgets;
- every read-only tool executes and returns **≤ 1500 chars** (the WebMCP
  single-output ceiling);
- the declarative forms carry their annotations
  (`submit_doodle_feedback` on all pages, `create_doodle_board` on `/boards`).

It never involves a model. If this fails, fix the registration before looking
at Layer 2 — an agent cannot use tools that are not correctly registered.

```bash
# localhost (dev server must be running: pnpm dev:local)
node scripts/webmcp-smoke.mjs

# explicit base URL
WEBMCP_BASE_URL=http://localhost:4321 node scripts/webmcp-smoke.mjs

# watch it run
HEADFUL=1 node scripts/webmcp-smoke.mjs
```

---

## Layer 2 — autonomous agent behaviour (`webmcp-agent-eval.mjs`)

This is the layer this document was written for. It drives Canary with the
**same** launch flags, throwaway-profile flag injection, and WebSocket handling
as the smoke test, then runs an OpenAI function-calling agent loop against the
scenarios in `scripts/webmcp-scenarios.json`.

**The core constraint:** the model sees **only** tool names, descriptions, and
`inputSchema`s, plus the **strings the tools return**. It never sees page HTML,
DOM text, or raw endpoint URLs. If it succeeds, the tools alone were sufficient
— which is the entire promise of WebMCP. The constraint is structural, not
polite: the harness only ever calls `getTools()` / `executeTool()` in the page;
it never reads markup into the conversation.

### The loop

1. Enumerate tools via `document.modelContext.getTools()`, normalising
   `inputSchema` when Canary hands it back as a JSON string.
2. Map each WebMCP tool to one OpenAI function
   (`function.name = tool.name`, `function.description = tool.description`,
   `function.parameters = parsed inputSchema`).
3. `POST {OPENAI_BASE_URL}/chat/completions` with `tools` and `tool_choice:auto`.
4. For each `tool_call`, execute it in the page via
   `executeTool(tool, argsObject)` and return the string result as a
   `role:"tool"` message.
5. Loop to a step cap (`--max-steps`, default 8), then capture the final
   assistant answer.

### Assertion model (graded per scenario)

Every scenario is graded on five dimensions:

1. **`sensibleTool`** — at least one expected tool was invoked
   (`expectedToolsMode: "any"`, default) or all of them (`"all"`).
2. **`executionSucceeded`** — at least one non-skipped tool call returned a
   result.
3. **`outputBudget`** — every tool result was ≤ 1500 chars.
4. **`grounded`** — every `requiredSubstrings` entry is present in the final
   answer (case-insensitive). This is the anti-fabrication check: the answer
   must reflect what the tools actually returned.
5. **`noHallucination`** — no `forbiddenSubstrings` entry is present.

A scenario **passes only if all five hold**. Assertions are grounded in fields
the tools *provably emit* (e.g. `get_doodle_skill` always emits `(<id>)`,
`no photo needed` / `needs a photo`, `N credit(s)`), never in brittle exact
numbers that would break when pricing or the catalogue changes.

### Scenarios (`scripts/webmcp-scenarios.json`)

| id | Task | Proves |
|---|---|---|
| `surprise-no-photo` | Skill that needs no photo | photo-flag filtering + grounding |
| `find-sticker-guide` | Find the sticker-sheet guide | article discovery via `search_doodle_articles` |
| `operational-status` | Current operational status | `get_doodle_status` grounding (⚠️ untrusted content) |
| `compare-two-skills` | Compare `stickers` vs `crayon` | multi-call reasoning grounded in tool output |
| `credit-cost` | Credit cost of `normal` | cost grounded in tool output, not invented |
| `invalid-input-recovery` | Detail for a fake skill id | **graceful recovery** — tool returns a guidance string, agent must not hallucinate a description |

### No-LLM fallback

If `OPENAI_API_KEY` is unset the harness does **not** fail silently and does
**not** skip the browser. It runs a deterministic mode that invokes each
scenario's expected read-only tools once with reasonable arguments, records the
same trace/coverage/latency data, and marks the report clearly as **"no model
used — agent reasoning was NOT graded"**. This still catches
registration/execution regressions in CI without an API key.

### Safety

- **Read-only by default.** `open_doodle_page` (navigational) and the
  declarative/mutating tools (`submit_doodle_feedback`, `create_doodle_board`)
  are **skipped** unless `--allow-writes` is passed. `open_doodle_page` is
  skipped even *with* the flag — navigating the tab mid-run would tear down the
  tool surface for later scenarios.
- **Production writes are refused.** Even with `--allow-writes`, any write tool
  against `doodleai.art` / `www.doodleai.art` is refused with a clear message.
  Writes are only ever attempted against a non-production target.

### Prompt-injection flagging

Tools with `annotations.untrustedContentHint === true`
(`get_doodle_status`, `search_doodle_articles`, `get_doodle_article`) return
externally-sourced text. When such a tool's output enters the model's context,
the harness records it per-call (⚠️ in the trace) and in a dedicated report
section — that is the surface a prompt-injection attack would ride in on.

### Reports

Every run writes `reports/webmcp-agent-eval-<timestamp>.json` and `.md` with:

- per-scenario pass/fail and each of the five assertion results;
- the full tool-call trace — tool, arguments, outcome, char count, latency;
- token usage per scenario when the provider returns it;
- a **coverage table** of which registered tools were actually exercised;
- a prompt-injection-exposure section.

The `reports/` directory is created automatically. **It should be gitignored**
(add `reports/` to `.gitignore` — this harness deliberately does not edit
`.gitignore` itself). The process exits **nonzero if any scenario fails**.

### Run commands

Configuration is env/flags: `WEBMCP_BASE_URL` (or `--base`), `OPENAI_BASE_URL`
(default `https://api.openai.com/v1`), `OPENAI_MODEL` (or `--model`),
`OPENAI_API_KEY`.

```bash
# --- localhost (dev server running: pnpm dev:local) ---

# with a model (OpenAI):
OPENAI_API_KEY=sk-... OPENAI_MODEL=gpt-4o-mini \
  node scripts/webmcp-agent-eval.mjs

# with any OpenAI-compatible provider (OpenRouter, local Ollama, …):
OPENAI_BASE_URL=https://openrouter.ai/api/v1 \
OPENAI_API_KEY=sk-or-... OPENAI_MODEL=openai/gpt-4o-mini \
  node scripts/webmcp-agent-eval.mjs

OPENAI_BASE_URL=http://localhost:11434/v1 \
OPENAI_MODEL=llama3.1 OPENAI_API_KEY=ollama \
  node scripts/webmcp-agent-eval.mjs

# no key → deterministic tool-surface exercise (no reasoning graded):
node scripts/webmcp-agent-eval.mjs

# watch it, raise the step cap:
HEADFUL=1 node scripts/webmcp-agent-eval.mjs --max-steps 12

# --- staging ---
WEBMCP_BASE_URL=https://doodleai-agent-staging.yash-892.workers.dev \
OPENAI_API_KEY=sk-... OPENAI_MODEL=gpt-4o-mini \
  node scripts/webmcp-agent-eval.mjs
# or:
node scripts/webmcp-agent-eval.mjs --base https://doodleai-agent-staging.yash-892.workers.dev

# writes are permitted ONLY against non-production (e.g. staging/localhost):
node scripts/webmcp-agent-eval.mjs \
  --base https://doodleai-agent-staging.yash-892.workers.dev --allow-writes

# --- production (READ-ONLY; writes are refused even with --allow-writes) ---
WEBMCP_BASE_URL=https://doodleai.art \
OPENAI_API_KEY=sk-... OPENAI_MODEL=gpt-4o-mini \
  node scripts/webmcp-agent-eval.mjs
```

---

## Layer 3 — interactive human QA (the extension)

The browser extension is the human-driven counterpart. A person configures an
OpenAI-compatible provider (same contract — base URL, model, user-supplied API
key), opens a Doodle AI page, and drives an agent through the same WebMCP tools
by hand. It is for exploratory QA, demos, and judging answer *quality* — the
subjective call the scripted layers deliberately do not make.

Use it when you want to *feel* how the tools behave, try prompts the scenario
file does not cover, or reproduce a report failure interactively.

---

## Which layer, when

- **CI on every change to the WebMCP surface** → Layer 1 (fast, no key).
  Optionally Layer 2 in no-LLM fallback (still no key) to catch execution
  regressions.
- **Before shipping a tool change / new tool** → Layer 2 with a real model
  against localhost, then staging.
- **Exploratory QA, demos, "does this actually feel right"** → Layer 3.

## Requirements

- **Chrome Canary** at the default macOS path, or `CANARY_BIN` pointing at the
  executable. The `enable-webmcp-testing` flag is injected into a throwaway
  profile — the real profile is never touched.
- **Node 22+** (native `WebSocket` + `fetch`). Both scripts are dependency-free
  and do not touch `package.json`.
- Neither script runs lint, typecheck, or build.
