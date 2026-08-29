# WebMCP Agent Tester

A Manifest V3 Chrome extension that acts as a **real OpenAI-compatible agent**
against a web page's [WebMCP](https://webmachinelearning.github.io/webmcp/) tools
(`document.modelContext`). It lets you detect a page's registered tools, invoke
them manually, and run a natural-language task through an LLM that is given
**only the tool metadata** — never the page's HTML or DOM. That constraint is the
whole point: it proves the tools alone are enough for an agent to succeed.

Vanilla JS/HTML/CSS. **Zero dependencies. Zero build step.** Load it unpacked.

---

## Install

1. Open `chrome://extensions`.
2. Toggle **Developer mode** (top right) ON.
3. Click **Load unpacked** and select this directory:
   `tools/webmcp-agent-tester/`.
4. Pin the extension and click its toolbar icon to open the **side panel**.

Requires Chrome/Chromium **128+** (side panel + WebMCP origin trial/flag).

### Enable WebMCP in Chrome

WebMCP is behind a flag. Enable it and restart the browser:

```
chrome://flags/#enable-webmcp-testing  →  Enabled
```

Notes from the shared brief:
- WebMCP needs a **secure context** and **origin isolation**. A page that sends
  `Origin-Agent-Cluster: ?0` disables it.
- It is gated by the `tools` Permissions Policy (default allowlist `self`).
  Cross-origin iframes need `allow="tools"`.
- `navigator.modelContext` is deprecated; this extension probes
  `document.modelContext` first.

If the availability dot stays red on a page you expect to work, confirm the flag
is Enabled, the page is HTTPS (or `http://localhost`), and reload the page.

---

## Configure the LLM endpoint

Open the **Settings** tab in the side panel:

| Field | Notes |
|---|---|
| **Base URL** | OpenAI-compatible root. Default `https://api.openai.com/v1`. Also works with `https://openrouter.ai/api/v1`, `http://localhost:11434/v1` (Ollama), etc. |
| **Model** | Free-text model id, e.g. `gpt-4o-mini`, `openai/gpt-4o`, `llama3.1`. |
| **API key** | Password field. Stored **only** in `chrome.storage.local`, sent **only** to the Base URL you configured as a `Bearer` header. Never logged, never exported. |
| **Max agent steps** | Loop budget (default 8). |

Click **Save**, then **Test connection** to send a 1-token ping to
`{baseUrl}/chat/completions`.

### Host permissions (important)

The extension ships with **no `host_permissions`**. It works out of the box for
`api.openai.com` because Chrome allows the fetch. If you point the Base URL at a
**different origin** (OpenRouter, a self-hosted gateway, `localhost:11434`, …),
Chrome may block the request with a CORS/host error.

To allow it, add that origin to `host_permissions` in `manifest.json` and reload
the extension. Example for OpenRouter + local Ollama:

```json
"host_permissions": [
  "https://openrouter.ai/*",
  "http://localhost:11434/*"
]
```

This is deliberately **not** pre-granted: broad host access is exactly what a
testing tool should avoid. You add only the endpoint origin you actually use.

---

## Run a test

### Against production — https://doodleai.art

1. Navigate a tab to <https://doodleai.art> and let it load.
2. Open the side panel → click **Detect tools**. The availability dot turns green
   and the **Tools** tab lists Doodle AI's imperative tools
   (`list_doodle_skills`, `get_doodle_overview`, `search_doodle_articles`, …).
3. Keep **Read-only mode ON** (default). On production this is mandatory — the
   guardrails below block anything that navigates or writes.
4. In the **Agent** tab, type a task, e.g.
   *"What skills does Doodle AI offer? Summarize the top three."*
5. Click **Run agent** and watch the transcript: each model tool choice, the
   arguments, the raw result, its char count vs the 1500 budget, latency, and any
   errors.

### Against local dev — http://localhost:4321

1. Start the Doodle AI dev server so it serves on `http://localhost:4321`.
2. `http://localhost` is a secure context, so WebMCP works without HTTPS.
3. Same flow: navigate the tab there, **Detect tools**, run a task.
4. Writable tools (`submit_doodle_feedback`, `create_doodle_board`) must only be
   exercised against **staging/local**, never production — and only by turning
   **Read-only mode OFF** yourself. The extension never flips that for you.

---

## Manual invoke

The **Invoke** tab lets you run one tool directly: pick it, edit the JSON
arguments box (prefilled from the tool's parsed `inputSchema`), click **Run
tool**, and see the raw string result plus its length against the 1500-char
budget. Read-only mode blocks the same tools here as in the agent loop.

---

## Guardrails

- **Read-only mode** (toggle, ON by default). While ON, the extension refuses to
  execute any tool whose `readOnlyHint` is not exactly `true`, and additionally
  hard-blocks the known navigational/mutating tools regardless of annotations:
  `open_doodle_page`, `submit_doodle_feedback`, `create_doodle_board`. Blocked
  calls are shown in the transcript and reported back to the model as an error,
  so the agent can adapt instead of silently failing.
- **Untrusted output warning.** Any result from a tool with
  `untrustedContentHint: true` (e.g. `get_doodle_status`) is visibly flagged as a
  prompt-injection risk, and the system prompt instructs the model to treat such
  output as data, never as instructions.
- **Metadata-only agent.** The LLM receives only `name` / `description` / parsed
  `inputSchema` per tool, plus your task text. It never receives page HTML, DOM
  text, or raw endpoint URLs.
- **Key hygiene.** The API key is only ever placed in the `Authorization` header
  of the fetch to your configured Base URL. It is never written to the
  transcript, the console, or the exported report.

---

## Export

The **Agent** tab exports the full run (endpoint sans key, origin, task,
read-only state, every step with args/result/char-count/latency/errors, final
answer) as **JSON** or **Markdown** via a Save dialog.

---

## Permissions — what and why

Requested in `manifest.json`:

| Permission | Why it is needed |
|---|---|
| `sidePanel` | The entire UI is a Chrome side panel (`chrome.sidePanel`). |
| `storage` | Persist Base URL / model / API key / settings in `chrome.storage.local`. |
| `scripting` | Re-inject `content.js` into a tab that was already open before the extension loaded (`chrome.scripting.executeScript` with `activeTab`). |
| `activeTab` | Scope injection and bridge messaging to the tab the user is looking at, instead of requesting broad host access. |
| `tabs` | Read the active tab id/url to route bridge messages and record the tested origin in the report. |
| `downloads` | Save the JSON/Markdown report via `chrome.downloads` (falls back to a blob link if unavailable). |

**No broad `host_permissions` are requested.** Page injection uses the
`content_scripts` match plus `activeTab`; the LLM fetch relies on the browser's
default allowance for the endpoint, and any non-default endpoint origin is added
by the user (see *Host permissions* above). `web_accessible_resources` exposes
only `injected.js` (the main-world bridge), which is required because
`document.modelContext` is reachable only from the page's main world.

---

## How the main-world bridge works

`document.modelContext` lives in the page's **main world** and is invisible to a
normal (isolated-world) content script. So:

```
side panel  <-- chrome.runtime -->  content.js (isolated world)
                                        |  window.postMessage (same-origin,
                                        v   namespaced, origin-checked)
                                     injected.js (MAIN world)  -->  document.modelContext
```

- `content.js` injects `injected.js` into the main world and relays
  `listTools` / `executeTool` / `toolchange`.
- Messages carry a `source` tag (`wmt-cs` / `wmt-page`) and are posted to and
  checked against the page's own origin — never `"*"`.
- `injected.js` subscribes to `toolchange` so late tool registration is not
  missed; the panel re-renders on that event.

---

## File tree

```
tools/webmcp-agent-tester/
├── manifest.json      # MV3 manifest, minimal permissions, no host_permissions
├── background.js      # service worker: open side panel, re-inject, relay events
├── content.js         # isolated-world bridge: injects injected.js, relays msgs
├── injected.js        # MAIN-world script: the only code touching modelContext
├── sidepanel.html     # side panel UI (Agent / Tools / Invoke / Settings)
├── sidepanel.css      # styling (neutral dark, flat surfaces)
├── sidepanel.js       # controller: settings, bridge, agent loop, guardrails, export
└── README.md          # this file
```
