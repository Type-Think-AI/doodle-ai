# MCP doodle tools — schema + auth stub

**Status:** proposed. Companion to [grok-voice-realtime-plan.md](./grok-voice-realtime-plan.md).
**Not WebMCP.** Browser `document.modelContext` tools in `docs/webmcp.md` must
never spend credits. This server is the opposite: Grok Voice calls it
server-side via `session.tools` (`type: "mcp"`) and the spend path is the
existing PicX + ledger stack.

Do **not** point Grok at `https://mcp.fal.ai`. That is fal's coding MCP for
IDE assistants, not Doodle product tools.

---

## Endpoint

| Env | URL | Transport |
|---|---|---|
| prod | `https://doodleai.art/mcp` | Streaming HTTP (primary). SSE at `/mcp/sse` only if the fal/xAI client still requires it. |
| staging | `https://dev.doodleai.art/mcp` | same |

Hosted on the existing Worker (`doodleai-agent` / `doodleai-agent-staging`).
Prefer Cloudflare Agents `createMcpHandler` (stateless Streamable HTTP) over
the deprecated `McpAgent` Durable Object. Session *business* state lives in a
`VoiceSession` Durable Object / KV record keyed by **our** `sid`, not by an
MCP protocol session id.

Pin `@modelcontextprotocol/sdk` **≥ 1.26.0** (CVE-2026-25536: cross-client
leak when a Streamable HTTP transport is reused).

---

## Auth headers

xAI/fal presents whatever we put on `session.update` → `tools[].authorization`
/ `tools[].headers` when it calls us. Cookies never arrive.

| Header | Required | Value |
|---|---|---|
| `Authorization` | yes | `Bearer <mcp_capability_token>` |
| `X-Doodle-Session` | yes | `sid` (same id as the token claim). Reject mismatch. |
| `X-Doodle-Origin` | no | `talk` — reserved so a later chat-MCP share can distinguish callers |

### Capability token (HMAC, same family as `src/lib/voice/token.ts`)

Minted only after `requireOrg(context, { generation: ["create"] })`. Signed
with `BETTER_AUTH_SECRET` via `readSecret()`. Never a Better Auth session
cookie, never `FAL_KEY`.

```ts
interface McpCapabilityClaims {
  typ: "mcp";
  uid: string;          // Better Auth user id
  oid: string;          // active org — credits spend here
  sid: string;          // VoiceSession id
  scp: McpToolName[];   // allowlist copy; server still enforces
  exp: number;          // unix seconds
}
```

Proposed TTL: **15 minutes**, refreshable from the signed-in browser via
`POST /api/voice/session` (cookie/bearer). xAI keeps using the token we
handed it on `session.update`; the browser re-sends `session.update` when
it refreshes.

Reject if: missing/malformed/expired, `typ !== "mcp"`, `sid` header mismatch,
tool name not in `scp`, or the `VoiceSession` row is closed.

---

## Tool list

Names are **camelCase**, matching the chat matcher aliases in
`src/pages/api/chat.ts` / `src/voice/VoiceRoom.ts`
(`generateDoodle` \| `generate-doodle`, etc.). Advertise camelCase only so
Grok does not dual-call.

`session.tools[0].allowed_tools` must be this exact list so a future admin
tool on the same host cannot be discovered.

### `generateDoodle`

Wraps `src/mastra/tools/generate-doodle.ts` (`id: "generate-doodle"`).
Does **not** go through Mastra. MCP handler calls the same execute path
(extract a shared `runGenerateDoodle(input, requestContext)` during
implementation).

**Input** (from the existing Zod schema):

| Field | Type | Notes |
|---|---|---|
| `skill` | enum `GENERATION_MODES` | `src/lib/doodle-constants.ts` |
| `imageUrl` | string, optional | Required except `surprise`. Must pass the PicX CDN allowlist. |
| `description` | string, optional | Surprise character text / gift occasion scan |
| `refImageUrl` | string, optional | Extra style ref; ignored for `surprise` |

**Output** (tool result Grok hears; also fan out as `StreamEvent`):

| `status` | Meaning | Browser event |
|---|---|---|
| `queued` | PicX accepted; `jobId`, `frames`, `credits` | `{ type: "media", jobId, frames, skillId }` |
| `needs-photo` | Ask the user to attach | HUD copy only |
| `insufficient-credits` / `org-cap-reached` | `{ type: "notice", kind: "credits" }` + `{ type: "credits", balance }` | |
| `rate-limited` | Spoken retry | none |
| `error` | Config / origin / submit failure | `{ type: "error", message }` (user-safe) |

Do not return raw PicX URLs for Grok to read aloud. The canvas watcher
(`startImageJob` in chat, reused from Talk) paints frames when the webhook
completes the `generation` row.

### `generateVideo`

Wraps `src/mastra/tools/generate-video.ts` (`id: "generate-video"`).
**Internal / not marketing-ready.** Still expose the tool so Talk can
animate a doodle; do not advertise video or paid plans in consumer copy.

| Field | Type | Notes |
|---|---|---|
| `skill` | enum `VIDEO_SKILL_IDS` | `src/lib/video/skills.ts` |
| `imageUrl` | string, optional | `motion` — this picture is frame one |
| `referenceUrls` | string[], optional | `reel` — 1..`MAX_VIDEO_REFERENCES` likeness refs |
| `seconds` | int, optional | clamped `MIN`..`MAX` in `src/lib/video/constants.ts`; **1 credit / second** |
| `description` | string, optional | What happens in the clip |

Queued → `{ type: "video", jobId, estimatedSeconds, skillId }`.
Same credit / rate-limit / org-cap statuses as images. Requires public
`https` `publicOrigin` (existing tool refuses otherwise).

### `readCanvas`

Wraps `src/mastra/tools/canvas-read.ts`. Input: `{}`.
Output: `canvasDigestSchema` from `src/lib/canvas/ops.ts`, or
`EMPTY_DIGEST` if the Talk client has not posted a digest yet.

The digest is **not** on the MCP request. The browser `POST`s it to
`/api/voice/session/:sid/canvas` (same shape `/api/chat` already accepts as
`canvas`). The tool reads `VoiceSession.canvasDigest`.

### `editCanvas`

Wraps `src/mastra/tools/canvas-edit.ts`. **Applies nothing on the Worker.**
Validates via `validateBatch` / `canvasBatchSchema` (`MAX_OPS_PER_BATCH` =
40). Surviving ops fan out as `{ type: "canvas", ops, label }`; the existing
`apply-ops.ts` interpreter runs them in one `editor.run()`.

| Field | Type |
|---|---|
| `ops` | `canvasBatchSchema` |
| `note` | string, max 200, optional |

`rejected` → Grok speaks the errors; no canvas event.

---

## RequestContext every tool gets

Identical keys to `src/lib/voice/context.ts` / `src/pages/api/chat.ts`. The
model never sees these; they are not tool inputs.

```
platformPicxKey, styleId?, familyId?, userId, organizationId,
projectId?, canvasDigest, db, sessions, publicOrigin
```

`publicOrigin` for Talk is the deployment origin (`https://doodleai.art` /
`https://dev.doodleai.art`) or `PICX_CALLBACK_ORIGIN` in tunneled local
dev — same rule as chat. `styleId` / `familyId` start unset in Talk
(voice has no theme chip in the HUD today); optional later.

---

## Allowlists (SSRF)

`imageUrl`, `refImageUrl`, and every `referenceUrls[]` entry must be
`https` and host-match:

- `cdn.picxstudio.com` (current PicX asset host in this repo)
- any additional host `POST /api/upload` already returns

Reject `http:`, IP literals, `localhost`, `*.internal`, credentialed URLs,
and redirects off the allowlist. Tools must not fetch the URL themselves
beyond what `submitImage` / `submitVideo` already do with the platform key.

`publicOrigin`, `PICX_API_KEY`, `FAL_KEY`, and ledger writes are never
taken from tool arguments.

---

## Side channel (required)

xAI executes MCP **server-side**. Tool JSON goes back to Grok, not to the
browser. After every mutating tool, append the matching `StreamEvent` to
`VoiceSession` and push it on `GET /api/voice/session/:sid/events` (SSE).
The Talk HUD dispatches through the existing
`handleVoiceCanvasEvent` / `doodleai:canvas-add` / `doodleai:canvas-ops`
path, and must **also** handle `media` / `video` jobIds the way
`src/scripts/app/chat/api-turn.ts` does (today's HUD only paints
`image`+url, `video`+url, and `canvas` — that gap is in scope for Talk).
