# WebMCP agent-testing brief (shared contract for all lanes)

Source of truth, fetched 2026-08-29:

- Spec draft: https://webmachinelearning.github.io/webmcp/
- Chrome docs: https://developer.chrome.com/docs/ai/webmcp
- Repo: https://github.com/webmachinelearning/webmcp

## Verified API surface (spec, not guesswork)

```webidl
partial interface Document {
  [SecureContext, SameObject] readonly attribute ModelContext modelContext;
};

[Exposed=Window, SecureContext]
interface ModelContext : EventTarget {
  Promise<undefined> registerTool(ModelContextTool tool, optional ModelContextRegisterToolOptions options = {});
  Promise<sequence<RegisteredTool>> getTools(optional ModelContextGetToolOptions options = {});
  Promise<DOMString> executeTool(RegisteredTool tool, optional object inputObject = {}, optional ModelContextExecuteToolOptions options = {});
  attribute EventHandler ontoolchange;
};

dictionary RegisteredTool {
  required DOMString name;
  DOMString title;
  required DOMString description;
  object inputSchema;
  required Window window;
  required USVString origin;
  ToolAnnotations annotations;   // readOnlyHint, untrustedContentHint
};
```

Facts that matter for a test harness:

1. `executeTool()` resolves to a **string** (the JSON-serialized tool result). Always a string.
2. `executeTool(tool, inputObject)` takes a real **object**, not a JSON string.
3. `getTools()` returns tools sorted ascending by `name`.
4. Chrome Canary may hand back `inputSchema` as a **JSON string** — parse when `typeof === "string"`.
5. Failures reject with `DOMException` (often `UnknownError`); the spec has open issues for finer errors.
6. Cancellation is via `AbortSignal` in `ModelContextExecuteToolOptions`.
7. `toolchange` fires on `document.modelContext` when tools are registered/unregistered — a harness should listen so late registration is not missed.
8. Secure context + **origin isolation** required. `Origin-Agent-Cluster: ?0` disables WebMCP.
9. Gated by the `tools` Permissions Policy, default allowlist `self`. Cross-origin iframes need `allow="tools"`.
10. `navigator.modelContext` is deprecated. Probe `document.modelContext` first.
11. Spec allows tool `name` length 1..128; Google's *authoring guidance* is stricter (30 chars) and Doodle AI follows the stricter one.

## Local flag

`chrome://flags/#enable-webmcp-testing` → Enabled. Headless harnesses inject
`{"browser":{"enabled_labs_experiments":["enable-webmcp-testing@1"]}}` into a throwaway profile's `Local State`.

Launching Canary from this machine additionally requires `--no-sandbox --disable-gpu`
(restricted macOS profile) and `--remote-allow-origins=*` (Node's WebSocket always
sends an Origin header, which Chrome's DevTools endpoint otherwise rejects).

## Doodle AI's live surface (production, verified)

Imperative, all `readOnlyHint: true` except where noted:

| Tool | Notes |
|---|---|
| `list_doodle_skills` | paginated |
| `get_doodle_skill` | by id |
| `get_doodle_overview` | product summary |
| `get_doodle_status` | `untrustedContentHint: true` |
| `open_doodle_page` | **navigates** — never auto-execute in a harness |
| `search_doodle_articles` | query |
| `get_doodle_article` | by url |

Declarative forms: `submit_doodle_feedback` (all pages), `create_doodle_board` (`/boards`).

Hard rules that must not be broken by any test tooling:

- No tool spends credits, reads account data, or returns an API key.
- No `toolautosubmit` anywhere.
- Every imperative tool output stays <= 1500 chars.
- Writable tools (`submit_doodle_feedback`, `create_doodle_board`) are only exercised
  against staging, never production, and only behind an explicit opt-in flag.

## LLM configuration contract (shared by extension and CLI harness)

OpenAI-compatible, so any provider can be plugged in:

| Field | Example |
|---|---|
| Base URL | `https://api.openai.com/v1`, `https://openrouter.ai/api/v1`, `http://localhost:11434/v1` |
| Model | free-text string |
| API key | user-supplied, never committed, never logged |

Use `POST {baseUrl}/chat/completions` with OpenAI `tools: [{type:"function", function:{name, description, parameters}}]`
and follow `tool_calls` → `role:"tool"` message turns.

Map each WebMCP `RegisteredTool` to one OpenAI function:
`function.name = tool.name`, `function.description = tool.description`,
`function.parameters = parsed inputSchema` (fallback `{"type":"object","properties":{}}`).

The agent must receive **only** tool metadata — never page HTML, never DOM text,
never raw endpoint URLs. That constraint is the whole point: it proves the tools
alone are sufficient for an agent to succeed.
