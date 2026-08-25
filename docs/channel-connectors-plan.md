# Doodle AI Channel Connectors Plan

**Status:** Proposed architecture and implementation plan
**Date:** 2026-08-25
**Scope:** WhatsApp Business Cloud first, Discord second, with a reusable connector platform for future channels

## 1. Executive recommendation

Build a **Channel Connectors** capability that lets an authenticated Doodle AI user use the same Doodle agent, skills, generation history, and credit balance from messaging platforms.

Recommended order:

1. **WhatsApp Business Cloud MVP** — the strongest daily-use channel for photo-led creation and one-to-one conversations.
2. **Discord slash-command and DM MVP** — useful for creator communities and collaborative workflows.
3. **Discord regular-message mode** — only after a Gateway/Durable Object design is proven in a spike.
4. **Additional adapters** — Telegram, Messenger, Instagram, Slack, or another Chat SDK adapter only after the shared connector contract is stable.

The core design is:

```text
Doodle AI web account
        |
        | short-lived pairing code
        v
Channel identity (WhatsApp number / Discord user)
        |
        v
Connector resolver -> Doodle thread -> shared agent execution -> credits + PicX generation
        |
        v
Platform-native response (text, buttons, image, retry/link)
```

This is not a personal-account automation system. Doodle AI should own and operate a WhatsApp Business number and a Discord bot/application. Users link their external identity to their Doodle AI account; they do not give Doodle AI personal WhatsApp or Discord credentials.

## 2. Research findings

### Mastra channel model

Mastra channels use Chat SDK adapters. The agent receives a platform message through the normal agent pipeline and posts the response back to the same conversation. The configuration pattern is one agent with channel adapters, for example:

```ts
channels: {
  adapters: {
    whatsapp: createWhatsAppAdapter(),
    discord: createDiscordAdapter(),
  },
}
```

Mastra generates a webhook route per agent and platform:

```text
/api/agents/<AGENT_ID>/channels/<PLATFORM>/webhook
```

For this project, the expected routes are:

```text
https://doodleai.art/api/agents/doodle-agent/channels/whatsapp/webhook
https://doodleai.art/api/agents/doodle-agent/channels/discord/webhook
```

The exact route mounting behavior must be verified against the current Mastra Astro integration before implementation. If the generated route is not exposed correctly by the Astro/Cloudflare adapter, use explicit Astro API routes that delegate to the Chat SDK webhook handlers rather than replacing the channel architecture.

Mastra recommends persistent storage for channels because channel subscriptions, thread state, tool approvals, and memory must survive Worker restarts. The current application does not configure Mastra storage or `@mastra/memory`; its web conversation history is currently client-side/localStorage plus D1 sync APIs. Channel support therefore requires a deliberate server-side conversation/state decision before production rollout.

### WhatsApp Business Cloud

The official Mastra page uses `@chat-adapter/whatsapp`. The adapter expects application-level credentials:

```text
WHATSAPP_ACCESS_TOKEN
WHATSAPP_APP_SECRET
WHATSAPP_PHONE_NUMBER_ID
WHATSAPP_VERIFY_TOKEN
```

The adapter documentation describes two webhook flows:

- `GET` verification handshake: Meta sends a challenge and the verify token must match.
- `POST` event delivery: incoming messages and interactive events are verified using `X-Hub-Signature-256`.

Important product and platform constraints:

- This is a **WhatsApp Business Cloud** integration, not access to a user’s personal WhatsApp account.
- The bot can use typing/read indicators after receiving an inbound message.
- Outside WhatsApp’s 24-hour customer-service window, outbound business-initiated messages require pre-approved templates.
- WhatsApp reply buttons support at most three buttons, with short labels; long cards fall back to text.
- Interactive message body text is limited, and long responses must be chunked or summarized.
- One media item per WhatsApp message is the practical rendering model; multiple generated images need separate messages.
- Public HTTPS image URLs can be passed through; otherwise media must be uploaded through the WhatsApp Cloud API.
- Incoming photos/media must be downloaded using the adapter/platform flow and then moved into the existing PicX-managed asset flow. Do not put short-lived Meta media URLs into durable generation records.

### Discord

The official Mastra page uses `@chat-adapter/discord`. The adapter expects:

```text
DISCORD_BOT_TOKEN
DISCORD_PUBLIC_KEY
DISCORD_APPLICATION_ID
DISCORD_MENTION_ROLE_IDS   # optional, comma-separated
```

Discord has two materially different event paths:

- **HTTP Interactions:** slash commands, button interactions, and verification pings. This is serverless-friendly and should be the first Discord MVP.
- **Gateway WebSocket:** regular message events and reactions. This requires a persistent listener. The Chat SDK documentation describes a cron-driven listener for serverless deployments, but this project runs on Cloudflare Workers and must prove the lifecycle, reconnect, overlap, and deployment behavior before relying on it.

Discord bot installation also requires explicit scopes and permissions. The minimum MVP permission set should be narrow: use `bot` and `applications.commands`, then request only the ability to send messages, attach files, and read the relevant interaction context. Do not request administrator permissions.

### Research sources

- [Mastra WhatsApp integration](https://mastra.ai/integrations/channels/whatsapp)
- [Mastra Discord integration](https://mastra.ai/integrations/channels/discord)
- [Mastra Channels documentation](https://mastra.ai/docs/channels)
- [Chat SDK WhatsApp adapter](https://chat-sdk.dev/adapters/official/whatsapp)
- [Chat SDK Discord adapter](https://chat-sdk.dev/adapters/official/discord)

These sources were checked on 2026-08-25. Adapter APIs and platform limits can change; pin versions and re-check the linked documentation during implementation.

## 3. Current Doodle AI baseline

The existing application already contains useful pieces, but they are web-session-oriented:

- Astro 5 + TypeScript running as the Cloudflare Worker `doodleai-agent`.
- Mastra `1.61.0` in `/Users/yash/picx/doodlebooth-agent/package.json`.
- One `doodleAgent` registered from `/Users/yash/picx/doodlebooth-agent/src/mastra/index.ts`.
- Generation modes and Agent Skills under `/Users/yash/picx/doodlebooth-agent/src/mastra/skills/`.
- The real generation tool at `/Users/yash/picx/doodlebooth-agent/src/mastra/tools/generate-doodle.ts`.
- Better Auth with Google sign-in and bearer support in `/Users/yash/picx/doodlebooth-agent/src/lib/auth/`.
- D1-backed users, threads, messages, generations, and credit ledger in `/Users/yash/picx/doodlebooth-agent/src/db/schema/`.
- KV-backed sessions and rate-limit counters through the `SESSIONS` binding.
- `/Users/yash/picx/doodlebooth-agent/src/pages/api/chat.ts` currently requires a web auth session, streams NDJSON to the browser, and supplies Mastra `RequestContext` values including `userId`, D1, the server-owned PicX key, and the user’s rate-limit namespace.
- Browser conversation state still uses localStorage and is progressively imported/synced to D1 through the `/api/v1` routes.
- `wrangler.json` currently has D1, KV, an hourly Cron Trigger, and no Queue/Durable Object/Mastra channel-specific binding.
- `/Users/yash/picx/doodlebooth-agent/src/pages/settings.astro` already has a Connectors tab, currently describing provider connections rather than offering user-linked messaging channels.

The most important architectural gap is that a channel webhook has no Better Auth browser cookie. A webhook must resolve the Doodle account through a server-side channel-identity mapping before it can call a credit-metered tool.

## 4. Product behavior

### User journey

1. User signs in to Doodle AI with Google.
2. User opens **Settings → Connectors**.
3. User chooses WhatsApp or Discord and clicks **Connect**.
4. Doodle AI creates a short-lived, single-use pairing code.
5. The UI shows clear instructions:
   - WhatsApp: open the Doodle AI Business number and send `LINK ABC123`.
   - Discord: DM the bot or use `/link ABC123` in an approved server.
6. The inbound channel message is verified by the platform adapter, then the pairing code is checked against a hashed code in D1.
7. The external identity is linked to the Doodle user. The code is consumed immediately.
8. The user can now send a message or image through the channel.
9. Doodle AI resolves the external identity to the Doodle user, finds or creates a server-side Doodle thread, runs the same agent and generation tool, charges the same credit ledger, and replies with platform-native text and media.
10. The user can disconnect the channel from Settings, or send `UNLINK` from the linked channel.

### Supported commands for the first release

Use a small explicit command surface so account linking and operational actions do not depend on model interpretation:

| Command | Behavior |
|---|---|
| `HELP` | Explain supported prompts, photo requirements, credits, and account linking. |
| `LINK <code>` | Consume a pairing code and link the external identity. |
| `UNLINK` | Remove the current channel identity after confirmation. |
| `BALANCE` | Return the current credit balance without starting a generation. |
| `NEW` | Start a new Doodle thread for the linked account. |
| `CANCEL` | Cancel/ignore a pending generation where cancellation is supported. |
| Normal text | Send to the Doodle agent. |
| Photo plus text | Send the photo through the existing upload/generation path. |

The command parser must run before the model. `LINK`, `UNLINK`, `BALANCE`, and `HELP` must never spend credits or invoke generation.

### Output behavior

The channel response renderer should support these outcomes:

- Normal assistant text.
- A generated image as media, followed by a short caption and remaining credits.
- A request for a missing photo.
- Insufficient-credit response with a link back to Doodle AI.
- Rate-limit response.
- Retry link for a failed generation.
- Account-linking instructions for an unlinked sender.
- A concise fallback when a response is too long or a platform cannot render a card.

Do not paste raw PicX URLs into ordinary conversational text unless the platform requires a link fallback. Prefer native media and a signed/short-lived Doodle AI result link where a platform cannot attach the image directly.

## 5. Proposed architecture

### Shared execution service

First extract the channel-independent logic from `/Users/yash/picx/doodlebooth-agent/src/pages/api/chat.ts` into a reusable service, for example:

```text
/Users/yash/picx/doodlebooth-agent/src/lib/agent/run-doodle-turn.ts
```

The service should accept a normalized request:

```ts
interface DoodleTurnInput {
  userId: string;
  threadId: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  styleId?: string;
  source: "web" | "whatsapp" | "discord";
  externalThreadId?: string;
  attachments?: Array<{
    mimeType: string;
    url: string;
    kind: "subject" | "reference";
  }>;
}
```

It should own:

1. Validation and message normalization.
2. D1 message/thread persistence.
3. Mastra environment bridging and dynamic import.
4. `RequestContext` construction.
5. Agent invocation.
6. Generation status/tool-result extraction.
7. Credit balance lookup.
8. A normalized result/event stream for the caller.

The browser route can continue translating that result to NDJSON. A channel handler can translate the same result to WhatsApp or Discord messages. This prevents business logic from diverging between web and messaging apps.

### Connector runtime pipeline

```text
Platform webhook
  -> adapter signature/verification
  -> event idempotency check
  -> normalize inbound message
  -> resolve command or linked identity
  -> find/create channel_thread + Doodle thread
  -> download/upload attachments when needed
  -> runDoodleTurn()
  -> persist messages/generation state
  -> render platform response
  -> acknowledge webhook quickly
```

For long-running image generation, do not assume that holding a webhook request open is always safe. First validate Cloudflare `waitUntil` behavior with the Mastra channel route. For production reliability, use a queue-backed job path when generation may exceed the platform/request budget:

```text
webhook -> dedupe + persist inbound event -> enqueue job -> fast 200
worker consumer -> run agent/generation -> outbound channel send
```

The queue path must retain the raw provider event only as long as needed, avoid logging secrets, and use the provider event/message ID as an idempotency key.

### Mastra configuration

Extend the existing agent rather than creating a second copy of the Doodle instructions:

```ts
channels: {
  adapters: {
    whatsapp: createWhatsAppAdapter(),
    discord: createDiscordAdapter({
      // Keep the first Discord release interaction-focused.
    }),
  },
  // Add only after the current Cloudflare/Astro adapter contract is verified.
  // waitUntil / handler configuration should be wired to the actual runtime API.
}
```

Use `RequestContext` for per-request values, never module globals:

```text
platformPicxKey
userId
db
sessions
styleId
source
threadId
externalThreadId
```

Application-level channel secrets stay in Worker secrets. A user’s external identity is not a secret and should be treated as personal data, with minimized retention.

### Server-side conversation memory

Do not make channel conversations depend on localStorage. Add a server-side history path before enabling production channels.

Preferred sequence:

1. Verify the currently supported Mastra storage adapter(s) for Cloudflare Workers/D1 and the exact package versions.
2. If a compatible adapter exists, configure it and run channel thread/state tests across Worker restarts.
3. If not, use the existing D1 `thread` and `message` tables as the authoritative Doodle history, load a bounded recent context window, and pass it to the shared turn service. Treat Mastra channel state/subscriptions separately and implement only the minimum state required by the selected adapter.
4. Do not add an unverified Node-only storage package that reintroduces the Cloudflare bundling problem described in `/Users/yash/picx/doodlebooth-agent/README.md`.

The initial context window should be bounded by message count and character/token budget. Store full messages for the user’s history, but send only the necessary recent context to the model.

## 6. Database changes

Add a migration generated through the repository’s Drizzle workflow. Do not hand-write raw SQL when schema autogeneration is available.

### `channel_connection`

One row per Doodle account and provider connection.

Suggested fields:

```text
id                    text primary key
user_id               text not null -> user.id cascade
provider              text: whatsapp | discord
status                text: pending | active | revoked
external_account_id   text nullable        # phone number ID / Discord app or guild scope
label                 text nullable        # user-facing name
created_at            timestamp
updated_at            timestamp
last_seen_at          timestamp nullable
revoked_at            timestamp nullable
```

There should be a uniqueness rule preventing two active ownership records for the same provider identity where applicable.

### `channel_identity`

Maps an inbound provider identity to a Doodle account.

Suggested fields:

```text
id                    text primary key
connection_id         text not null -> channel_connection.id cascade
user_id               text not null -> user.id cascade
provider              text not null
provider_user_key     text not null        # normalized provider identity or keyed digest
provider_display_name text nullable
metadata_json         json nullable        # no access token or raw message payload
created_at            timestamp
last_seen_at          timestamp nullable
revoked_at            timestamp nullable
```

Use a normalized provider key and a unique composite index on `(provider, provider_user_key)`. For WhatsApp, avoid exposing or broadly logging the raw `wa_id`; store a keyed digest for lookup and a masked display value if needed. The HMAC key should be a Worker secret such as `CHANNEL_IDENTITY_HMAC_KEY`.

### `channel_thread`

Maps an external conversation to a Doodle server thread.

Suggested fields:

```text
id                    text primary key
connection_id         text not null -> channel_connection.id cascade
user_id               text not null -> user.id cascade
provider              text not null
external_thread_key   text not null
thread_id             text not null -> thread.id cascade
created_at            timestamp
updated_at            timestamp
last_inbound_at       timestamp nullable
last_outbound_at      timestamp nullable
```

The unique key should include provider and normalized external thread identity. Do not use provider IDs directly as Doodle thread primary keys; preserve internal UUID ownership boundaries.

### `channel_event`

Webhook replay and processing audit record.

Suggested fields:

```text
id                    text primary key
provider              text not null
event_key             text not null
connection_id         text nullable
external_thread_key   text nullable
status                text: received | queued | processing | processed | failed | ignored
payload_hash          text nullable
error_code            text nullable
received_at           timestamp
processed_at          timestamp nullable
```

Put a unique constraint on `(provider, event_key)`. Store hashes and operational metadata, not full raw payloads by default.

### `channel_pairing`

Short-lived account-linking challenges.

Suggested fields:

```text
id                    text primary key
user_id               text not null -> user.id cascade
provider              text not null
code_hash             text not null
expires_at            timestamp not null
attempts              integer not null default 0
consumed_at           timestamp nullable
created_at            timestamp
```

Pairing codes must be generated with cryptographic randomness, displayed once, stored only as a digest, expire in about 10 minutes, and be invalidated after a small failed-attempt threshold. Never put a Doodle session token or Google OAuth token into a WhatsApp/Discord message.

## 7. Account linking and authorization

### Why pairing is required

The inbound platform webhook is authenticated by Meta/Discord as a platform event, not as a Doodle user session. The sender’s platform identity must therefore be mapped to a Doodle user before any private data or credit-metered generation is allowed.

### Linking rules

- An unlinked sender receives only generic instructions and the Doodle AI pairing URL.
- A pairing code is single-use, provider-specific, short-lived, and rate-limited.
- A provider identity can be linked to at most one Doodle account at a time.
- A Doodle account may link one WhatsApp identity and multiple Discord identities/guild scopes only if the product explicitly needs that behavior; default to one per provider for MVP.
- `UNLINK` requires a confirmation step in-channel or from the authenticated web settings page to prevent accidental disconnects.
- Revoking a connector immediately blocks future inbound execution. Existing queued jobs must re-check connector status before spending credits.
- Every channel-originated D1 query must filter by resolved `userId`; never trust a user ID supplied by message text, provider metadata, or a model output.

### Shared-account behavior

Once linked, a user’s messaging conversation should appear in Doodle AI as a normal server-side thread. The web UI can show a small provider badge, but the channel should not be able to read unrelated web threads unless the product later adds an explicit “open thread” command and authorization check.

Default MVP isolation:

- One external conversation maps to one Doodle thread.
- Web threads and channel threads are separate by default.
- The user’s credits, characters, generation records, and generated media are shared because they are account-owned.
- Cross-channel continuation is a later feature requiring explicit thread selection, not an accidental consequence of using the same user ID.

## 8. Platform-specific implementation

### WhatsApp MVP

#### Configuration

Add the following secret/configuration entries only after approval and through the Worker secret mechanism:

```text
WHATSAPP_ACCESS_TOKEN
WHATSAPP_APP_SECRET
WHATSAPP_PHONE_NUMBER_ID
WHATSAPP_VERIFY_TOKEN
CHANNEL_IDENTITY_HMAC_KEY
CHANNEL_PAIRING_BASE_URL
```

Do not put real values in `/Users/yash/picx/doodlebooth-agent/.dev.vars.example`, tracked source, or the plan document.

#### Webhook

Configure Meta’s callback URL to:

```text
https://doodleai.art/api/agents/doodle-agent/channels/whatsapp/webhook
```

The route must support the Meta GET verification handshake and POST event delivery. Verify that the generated Mastra route is reachable after Astro build; if not, expose an explicit route under `/Users/yash/picx/doodlebooth-agent/src/pages/api/agents/doodle-agent/channels/whatsapp/webhook.ts` that delegates to the adapter’s webhook handler.

#### Message normalization

Normalize inbound messages to:

```text
provider = whatsapp
providerUserKey = keyed digest of phone/wa identity
externalThreadKey = adapter thread ID
externalMessageKey = Meta message ID
text = normalized text
attachments = downloaded/managed asset references
```

For inbound images:

1. Validate MIME type and a strict size limit.
2. Fetch the provider media using the adapter’s supported mechanism.
3. Upload it into the existing PicX managed asset endpoint or a shared server-side upload service.
4. Pass only the resulting managed HTTPS asset URL into the agent/tool context.
5. Delete temporary buffers/objects when the request/job ends.

#### Response policy

- Use `thread.startTyping()` and `thread.markAsRead()` where supported.
- Send generated output as native image media, not as an untrusted raw URL in a prompt response.
- Send no more than the platform’s practical media/card limits per message; split sticker-pack/multi-image results into separate messages.
- Use short buttons such as `Try again`, `Balance`, and `Open Doodle AI`.
- Create approved templates before any proactive notification or re-engagement feature.

### Discord MVP

#### Configuration

```text
DISCORD_BOT_TOKEN
DISCORD_PUBLIC_KEY
DISCORD_APPLICATION_ID
DISCORD_MENTION_ROLE_IDS       # optional, only if role mentions are needed
CHANNEL_IDENTITY_HMAC_KEY
CHANNEL_PAIRING_BASE_URL
```

#### Initial event surface

Start with interactions that do not require a persistent Gateway:

- `/link <code>`
- `/doodle <prompt>`
- `/balance`
- `/help`
- Button actions for retry/open/unlink confirmation
- Direct-message slash commands where Discord permits them

Configure the interactions endpoint at:

```text
https://doodleai.art/api/agents/doodle-agent/channels/discord/webhook
```

Use `EPHEMERAL` responses for account linking, balance, and private errors when the interaction context is a shared server channel. Never reveal a user’s credit balance publicly by default.

#### Gateway decision

Regular free-text messages and reactions require Gateway events according to the adapter documentation. Before implementing that mode, run a focused spike covering:

- Cloudflare Worker WebSocket lifecycle.
- Durable Object ownership and reconnect state.
- Discord heartbeat and resume behavior.
- Deployment/restart without duplicate listeners.
- Gateway rate limits and backoff.
- Cron overlap and stale listener cleanup if a cron-driven approach is used.

If the spike is not reliable, keep Discord interaction-first and do not claim that ordinary server messages are supported.

## 9. Web settings and UX

Extend the existing Connectors tab in `/Users/yash/picx/doodlebooth-agent/src/pages/settings.astro` without creating another nested settings sidebar.

Each connector row should show:

- Provider icon/name.
- Status: Not connected, Pairing pending, Connected, Revoked, or Error.
- Masked linked identity, e.g. `+91 •••• 4821` or Discord display name/server.
- Last activity time.
- Connect, Copy code, Revoke, and Disconnect actions.

Pairing UI requirements:

- Never show the pairing code in a URL query parameter.
- Make the expiry visible.
- Offer a copy button and platform-specific instructions.
- Poll or refresh status without exposing the code after initial display.
- Show a clear “This connects your Doodle AI account to the Doodle AI bot; it does not connect your personal account credentials” explanation.
- Preserve keyboard access, focus management, and mobile bottom-sheet behavior already used by the settings UI.

Use a route such as:

```text
POST /api/v1/connectors/:provider/pairing
GET  /api/v1/connectors
POST /api/v1/connectors/:provider/revoke
DELETE /api/v1/connectors/:provider
```

All settings routes require Better Auth. The inbound channel routes do not use browser auth; they use provider signature verification plus the identity resolver.

## 10. Security, privacy, and abuse controls

### Webhook security

- Let the official adapter perform platform signature verification where possible.
- Verify the raw request body, not a reserialized JSON body.
- Reject invalid signatures before parsing or enqueuing work.
- Use `channel_event` uniqueness to make retries idempotent.
- Return the platform-required success response for duplicate events without running the agent twice.
- Never log access tokens, app secrets, raw provider payloads, image URLs with embedded credentials, or full phone numbers.

### Identity and tenant isolation

- Resolve `userId` only from the D1 `channel_identity` mapping.
- Never allow message content to choose a Doodle user, thread, credit balance, source asset, or generation ID.
- Re-check connector status and ownership immediately before queued execution and before credit spend.
- Return generic “not found”/“not linked” responses that do not reveal whether another account exists.

### Generation abuse

- Apply a per-provider-identity inbound rate limit.
- Apply the existing per-user generation limit as a second guard.
- Apply stricter limits to pairing attempts and media downloads.
- Require available credits before generation; keep all spending in the existing append-only credit ledger.
- Use a stable idempotency key for queued generation jobs so retries cannot double-charge.
- Refund pending generation records through the existing reconciliation path when provider delivery or generation fails.

### Media and network safety

- Accept only supported image MIME types and enforce byte limits before upload.
- Do not fetch arbitrary URLs from user text as server-side media.
- If a channel supplies an external URL, allow only provider-approved URLs or a strict HTTPS allowlist and enforce timeout/size limits.
- Do not expose internal Worker/D1/KV endpoints or signed storage URLs to the model.
- Keep temporary media retention short and document it in the privacy policy.

### Privacy/legal

Update the privacy policy and terms before public launch to explain:

- WhatsApp/Discord identifiers stored for account linking.
- Message and media processing by the agent and PicX.
- Retention and deletion behavior.
- How users revoke a connector.
- WhatsApp Business/Meta and Discord third-party processing.
- Whether channel messages become part of Doodle AI account history.
- Commercial use and credit rules for generated content.

## 11. Implementation phases

### Phase 0 — architecture spike and acceptance contract

**Goal:** Prove the platform/runtime assumptions before adding production tables.

Tasks:

- Verify current `@mastra/core@1.61.0` channel API and the compatible Chat SDK adapter versions.
- Verify whether Mastra-generated channel routes are exposed by the Astro Cloudflare adapter.
- Build a local webhook smoke route with a tunnel and test WhatsApp GET/POST verification handling.
- Build a Discord interactions endpoint and verify PING, slash command, and button response behavior.
- Decide whether `ctx.waitUntil` is sufficient for a generation or whether a Queue is required.
- Verify a Cloudflare-compatible server-side history/storage option.
- Define normalized inbound/outbound interfaces and response size/media rules.

**Exit criteria:** no secrets committed; one verified inbound test event per platform reaches a local handler; architecture decision recorded for route mounting, storage, and long-running execution.

### Phase 1 — shared connector foundation

**Goal:** Add the account-linking and provider-independent data model.

Tasks:

- Add Drizzle schema for connections, identities, threads, pairing challenges, and event idempotency.
- Generate and review the D1 migration.
- Add provider-neutral connector service modules.
- Add pairing-code generation, hashing, expiry, attempt limits, consumption, and revocation.
- Add authenticated settings APIs.
- Add a reusable identity resolver used by all channel handlers.
- Extract the shared Doodle turn execution service from `/Users/yash/picx/doodlebooth-agent/src/pages/api/chat.ts`.
- Add unit tests for ownership, replay, expiry, and idempotency.

**Exit criteria:** a fake provider event can link to a real test user and create an isolated Doodle server thread without invoking a generation.

### Phase 2 — WhatsApp Business Cloud MVP

**Goal:** Ship a reliable one-to-one photo-to-doodle workflow.

Tasks:

- Add the pinned `@chat-adapter/whatsapp` dependency after approval.
- Configure app-level Worker secrets in staging.
- Register the adapter with the existing Doodle agent.
- Expose and verify the WhatsApp webhook route.
- Implement `LINK`, `HELP`, `BALANCE`, `NEW`, and `UNLINK`.
- Normalize inbound text and photos.
- Reuse PicX managed uploads for inbound photo assets.
- Run the shared agent with the resolved Doodle user context.
- Render text, native image replies, credit errors, and retry guidance.
- Add staging Meta webhook configuration and end-to-end tests.
- Update settings UI and legal copy.

**Exit criteria:** a staging user can link, send a photo and prompt, receive a generated image, see correct credit deduction, repeat a webhook safely, and revoke access.

### Phase 3 — Discord interactions MVP

**Goal:** Give creators a safe Discord workflow without depending on a persistent Gateway.

Tasks:

- Add the pinned `@chat-adapter/discord` dependency after approval.
- Create the Discord application and bot with least-privilege scopes.
- Configure interaction endpoint and signature verification.
- Implement `/link`, `/doodle`, `/balance`, `/help`, and retry/unlink buttons.
- Use ephemeral replies for private account actions.
- Add attachment normalization where supported by the adapter.
- Add server/channel scope policy and an allowlist for initial testing.

**Exit criteria:** a user can link from Discord, run a prompt or upload flow through an interaction, receive an image, and not leak private balance/account state to a shared server.

### Phase 4 — durable execution and Discord regular messages

**Goal:** Support higher-volume channel traffic and regular Discord conversation only if runtime assumptions pass.

Tasks:

- Add Cloudflare Queue or an equivalent durable job mechanism for inbound events and long generations.
- Add retry/backoff/dead-letter handling and job idempotency.
- Run the Gateway spike using the least operationally risky Cloudflare design.
- If needed, add a Durable Object for Gateway connection ownership and reconnect state.
- Add provider delivery status and operator metrics.
- Add Mastra persistent storage or a documented D1-backed history strategy.

**Exit criteria:** Worker restarts, retries, duplicate events, and concurrent messages do not duplicate runs or charge twice; regular Discord message support is either proven or explicitly deferred.

### Phase 5 — connector platform expansion

**Goal:** Add future platforms without copying provider logic.

Tasks:

- Implement a provider capability matrix.
- Add a normalized command and response renderer interface.
- Add one adapter at a time only where the official API, privacy model, and user demand justify it.
- Reuse pairing, identity, thread, event, rate-limit, and audit services.

Potential next channels: Telegram, Messenger, Instagram, Slack, or a web/mobile client. Each requires a separate provider review; do not assume WhatsApp/Discord semantics transfer directly.

## 12. Proposed file ownership

Likely implementation surface, subject to the Phase 0 spike:

```text
/Users/yash/picx/doodlebooth-agent/package.json
/Users/yash/picx/doodlebooth-agent/pnpm-lock.yaml
/Users/yash/picx/doodlebooth-agent/wrangler.json
/Users/yash/picx/doodlebooth-agent/src/env.d.ts
/Users/yash/picx/doodlebooth-agent/src/mastra/agents/doodle-agent.ts
/Users/yash/picx/doodlebooth-agent/src/mastra/index.ts
/Users/yash/picx/doodlebooth-agent/src/db/schema/channel.ts
/Users/yash/picx/doodlebooth-agent/src/db/schema/index.ts
/Users/yash/picx/doodlebooth-agent/src/lib/channels/
/Users/yash/picx/doodlebooth-agent/src/lib/agent/run-doodle-turn.ts
/Users/yash/picx/doodlebooth-agent/src/pages/api/v1/connectors/
/Users/yash/picx/doodlebooth-agent/src/pages/api/agents/doodle-agent/channels/
/Users/yash/picx/doodlebooth-agent/src/pages/settings.astro
/Users/yash/picx/doodlebooth-agent/src/scripts/app/settings.ts
/Users/yash/picx/doodlebooth-agent/migrations/
/Users/yash/picx/doodlebooth-agent/docs/privacy-policy.md or the existing legal pages
```

Do not edit `/Users/yash/picx/doodlebooth` as part of this work. Do not migrate Cloudinary. Do not create a native iOS/Android project.

## 13. Testing and observability

### Unit tests

- Pairing code generation never stores plaintext.
- Expired/consumed/provider-mismatched codes fail.
- A code cannot link an identity already owned by another user.
- Provider event replay returns success without a second agent run.
- External identity cannot read another user’s threads or balance.
- `BALANCE`, `HELP`, and `UNLINK` do not spend credits.
- Generation retry cannot double-charge the ledger.
- Invalid media types and oversized files are rejected.
- Response renderer respects provider character/button/media limits.

### Integration tests

- WhatsApp GET verification handshake.
- WhatsApp POST signature verification with a known fixture.
- WhatsApp inbound text and image normalization.
- WhatsApp native media response and text fallback.
- Discord PING verification.
- Discord slash command and button interaction.
- Discord ephemeral private response.
- D1 migration against a clean staging database.
- Worker restart during a pending event.
- Queue retry or duplicate webhook event.

### Browser tests

- Settings connector list at mobile and desktop widths.
- Pairing code display, copy, expiry, and success refresh.
- Revoke/disconnect flow.
- Empty, pending, error, and already-connected states.
- No credentials or raw provider IDs appear in rendered HTML.

### Operational signals

Track structured, privacy-minimized counters:

- `channel_webhook_received{provider}`
- `channel_webhook_rejected{provider,reason}`
- `channel_event_duplicate{provider}`
- `channel_pairing_success{provider}`
- `channel_pairing_failure{provider,reason}`
- `channel_agent_run{provider,status}`
- `channel_generation{provider,status}`
- `channel_delivery{provider,status}`
- `channel_latency_ms{provider,phase}`
- `channel_credit_spend{provider}`

Never include message text, access tokens, full phone numbers, or image contents in logs.

## 14. Rollout and rollback

### Environments

1. Local development with a tunnel and test provider accounts.
2. Cloudflare staging Worker and staging D1 database.
3. Production behind a connector feature flag.

### Rollout gates

- TypeScript check.
- Astro production build.
- Wrangler dry run.
- D1 migration review and staging apply.
- Provider signature fixtures pass.
- Authenticated web pairing flow passes.
- Credit ledger idempotency tests pass.
- Image upload and outbound media smoke test passes.
- Manual privacy/legal review.

### Rollback

- Disable connector creation in the web UI.
- Revoke or disable provider webhooks/bot interactions.
- Keep inbound event dedupe records and queued jobs inspectable.
- Do not delete channel identity data during a feature rollback; retain it only according to the published retention policy.
- If a generation bug is found, stop channel-triggered generation while leaving web generation untouched.
- Do not roll back by resetting or cleaning unrelated repository work.

## 15. Decisions and non-goals

### Decisions recommended now

- Use official WhatsApp Business Cloud, not personal-account automation.
- Use a Doodle-owned Discord bot, not user token collection.
- Use pairing codes, not OAuth/password capture, for channel identity linking.
- Reuse the existing Doodle agent and generation tool.
- Reuse the existing account-owned credit ledger.
- Separate channel threads from web threads in the MVP.
- Start Discord with interactions and slash commands; defer regular messages until Gateway reliability is proven.
- Extract shared execution before adding provider-specific code.
- Make webhook event idempotency and server-side identity resolution mandatory.

### Explicit non-goals for MVP

- Reading or automating a user’s personal WhatsApp account.
- Asking for or storing Discord user tokens, cookies, or passwords.
- Sending unsolicited WhatsApp campaigns or promotional messages.
- WhatsApp group automation.
- Cross-channel thread merging.
- Public Discord community moderation.
- Proactive notifications before approved WhatsApp templates and consent flows exist.
- User-authored arbitrary tools or account actions from messaging channels.
- Replacing Better Auth or the existing credit ledger.
- Removing Cloudinary or changing the native mobile app boundary.

## 16. Final acceptance checklist

The feature is ready for a limited public beta only when all of the following are true:

- [ ] A signed-in Doodle user can create and revoke a WhatsApp connector.
- [ ] A signed-in Doodle user can create and revoke a Discord connector.
- [ ] Pairing codes are one-time, hashed, short-lived, and rate-limited.
- [ ] Webhook signatures are verified before processing.
- [ ] Duplicate provider events do not invoke the agent twice.
- [ ] Every channel run resolves a Doodle `userId` server-side.
- [ ] Channel-generated images use the same PicX server key and credit ledger as web generation.
- [ ] Failed generation refunds are reconciled correctly.
- [ ] Incoming photo handling validates type/size and uses managed asset URLs.
- [ ] WhatsApp response limits, template restrictions, and media behavior are handled honestly.
- [ ] Discord interaction responses are private where needed.
- [ ] Discord regular-message support is either tested through a durable Gateway design or clearly disabled.
- [ ] Channel conversation history survives Worker restarts according to the selected storage strategy.
- [ ] Settings UI works at mobile and desktop widths with accessible states.
- [ ] Privacy policy and terms describe channel data processing and revocation.
- [ ] Typecheck, build, Wrangler dry run, targeted tests, and staging smoke tests pass.
- [ ] No changes were made to `/Users/yash/picx/doodlebooth`, Cloudinary migration was not introduced, and no native app was added.
