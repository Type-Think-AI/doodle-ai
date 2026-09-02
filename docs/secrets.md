# Secrets

Doodle AI reads secrets through **two** Cloudflare mechanisms at once. This is
deliberate, not a half-finished migration — each one covers a case the other
cannot.

| Mechanism | Where it works | Shape on `env` |
|---|---|---|
| **Secrets Store** (`secrets_store_secrets` in `wrangler.json`) | Deployed Workers | `{ get(): Promise<string> }` |
| **Per-Worker secrets** (`.dev.vars`, `wrangler secret put`) | `astro dev`, and as a fallback | plain `string` |

Both are read via `readSecret()` / `readSecrets()` in
`/Users/yash/picx/doodlebooth-agent/src/lib/secrets.ts`, so no call site
branches on which is configured. Switching a secret from one mechanism to the
other is a `wrangler.json` change with no code change.

## Why Secrets Store for deployed Workers

Before this, every secret had to be uploaded per Worker with
`wrangler secret put --name <worker>`. Prod and staging each held their own
copy, and adding a Worker meant remembering all six. A secret missing on one
Worker surfaced as a **500 on `/api/auth/sign-in/social`** with nothing in the
config to indicate what was wrong — the failure mode that prompted this setup.

Secrets Store makes the value account-level: defined once, bound into any
number of Workers by name.

## Current layout

Store ID: `801d9480d51848d69033ff869398bcbe`
(Dashboard: **Account → Secrets Store**)

| Secret in store | Prod binding | Staging binding | Shared? |
|---|---|---|---|
| `OPENROUTER_API_KEY` | `OPENROUTER_API_KEY` | `OPENROUTER_API_KEY` | yes |
| `OPENROUTER_MODEL` | `OPENROUTER_MODEL` | `OPENROUTER_MODEL` | yes |
| `PICX_API_KEY` | `PICX_API_KEY` | `PICX_API_KEY` | yes |
| `GOOGLE_CLIENT_ID` | `GOOGLE_CLIENT_ID` | `GOOGLE_CLIENT_ID` | yes |
| `GOOGLE_CLIENT_SECRET` | `GOOGLE_CLIENT_SECRET` | `GOOGLE_CLIENT_SECRET` | yes |
| `BETTER_AUTH_SECRET_PROD` | `BETTER_AUTH_SECRET` | — | **no** |
| `BETTER_AUTH_SECRET_STAGING` | — | `BETTER_AUTH_SECRET` | **no** |
| `PICX_WEBHOOK_SECRET` *(not yet provisioned)* | `PICX_WEBHOOK_SECRET` | `PICX_WEBHOOK_SECRET` | yes |

`PICX_WEBHOOK_SECRET` is **not yet in the store** — until it is created and
bound, the async generation path is disabled and video cannot work. See
[PICX_WEBHOOK_SECRET — required for async video](#picx_webhook_secret--required-for-async-video)
below for what it gates and how to obtain the value.

The **binding name is identical** in both environments (`BETTER_AUTH_SECRET`);
only the `secret_name` it points at differs. That is what keeps the split out
of the application code.

`BETTER_AUTH_SECRET` is deliberately **not** shared: it signs session tokens,
so distinct values mean a token minted on `dev.doodleai.art` cannot be
replayed against `doodleai.art`. The other five are the same upstream account
either way, so splitting them would add rotation work and buy nothing.

`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` are shared, which requires **both**
redirect URIs registered on the one Google OAuth client:

```
https://doodleai.art/api/auth/callback/google
https://dev.doodleai.art/api/auth/callback/google
```

A missing staging redirect URI produces `redirect_uri_mismatch` *after* the
user picks their Google account — the app looks fine until that point.

## PICX_WEBHOOK_SECRET — required for async video

This one is called out on its own because getting it wrong is **invisible**:
everything appears to work while it is unset, and only video is broken.

### What it gates

The async submit path is gated on `PICX_WEBHOOK_SECRET` being set. It signs
inbound deliveries to `POST /api/webhooks/picx`, which is public (PicX carries
no session) so the signature IS the authentication. While it is **blank or
missing**:

- **Image batches** silently fall back to the **synchronous** path — each
  render blocks its request, the previous behaviour. Still works, so a blank
  secret looks fine.
- **`POST /api/webhooks/picx`** refuses every delivery with **503**
  (`webhook_not_configured`) — it fails closed, never accepting an unverifiable
  completion "just this once".
- **Video has no synchronous fallback.** A clip is submitted async and is
  completed *only* by the inbound webhook. So with this secret blank, **video
  simply cannot work** — the clip is submitted, the credits are reserved, and
  nothing ever completes it (the hourly sweep in
  `src/lib/credits/reconcile.ts` eventually refunds it as a video timeout).

In `.dev.vars` the value is currently **present but empty**, which reads as
"configured" but behaves as "off". That empty string is what disables video.

### How to get the value (format `whsec_<hex>`)

Two sources — pick one:

1. **Per-request `callback_url`** (what this app uses). The signing secret is
   the deterministic **inline secret derived from the API key**. Read it from
   the API key's **detail endpoint** in the PicX developer console — it appears
   as a `whsec_`-prefixed value tied to that key and is stable for the key. No
   general API returns it beyond the key detail view.
2. **Registered webhook.** Create a webhook in the PicX console instead; it
   issues its **own** `whsec_` secret, shown **once** at creation — copy it
   then, it is not retrievable afterward.

Do not invent a value: the webhook computes `HMAC-SHA256` over
`{timestamp}.{rawBody}` and compares constant-time, so a wrong secret fails
*every* delivery with `401 invalid_signature`, which looks identical to "not
configured" from the outside.

### Where it belongs (project rule)

Same rule as every other secret here, stated explicitly because this is the
first one being provisioned since the video work:

- **Deployed Workers:** Cloudflare Secrets Store, bound via
  `secrets_store_secrets` in `wrangler.json` for **both** prod (top-level) and
  staging (`env.staging`). **Create the store secret BEFORE adding the
  binding** — a binding that references a secret which does not yet exist fails
  the deploy with **error 10182**, and that failure blocks **every later
  deploy** of that Worker, including git-connected auto-deploys. Use the
  commands under [Adding or rotating a secret](#adding-or-rotating-a-secret)
  with `--name PICX_WEBHOOK_SECRET`, then add both bindings.
- **Locally:** `.dev.vars` only, then `pnpm secrets:seed-local` so the local
  Miniflare store holds it (the binding shadows `.dev.vars` — see
  [Local development](#local-development)).
- **Never** in a tracked file, and **never** as a `PUBLIC_`-prefixed
  build-time var: it is a server-side signing key and must not reach the
  browser bundle.

Also add `PICX_WEBHOOK_SECRET: SecretLike` to `Env` in `src/env.d.ts` (typed
`SecretLike`, not `string`, so both mechanisms resolve through `readSecret()`).

## Adding or rotating a secret

```bash
export NODE_TLS_REJECT_UNAUTHORIZED=0   # local proxy/cert workaround
S=801d9480d51848d69033ff869398bcbe

# create (value via stdin — keeps it out of shell history, unlike --value)
echo 'the-value' | wrangler secrets-store secret create $S \
  --name MY_SECRET --scopes workers --comment "what uses this" --remote

# rotate in place
echo 'new-value' | wrangler secrets-store secret update $S --name MY_SECRET --remote

# inspect (never shows values)
wrangler secrets-store secret list $S --remote
```

Then add a `secrets_store_secrets` entry to `wrangler.json` — in the
**top-level** block for prod and inside `env.staging` for staging, since
`env.*` blocks do not inherit bindings — and redeploy. New secrets also need a
field on `Env` in `/Users/yash/picx/doodlebooth-agent/src/env.d.ts`, typed
`SecretLike` rather than `string`.

## Local development

There are two local modes, and they behave differently:

| Command | Runs as | Secrets come from |
|---|---|---|
| `pnpm dev` | `wrangler dev --remote --env staging` | the **real** account store — works with no setup |
| `pnpm dev:local` | `astro dev` (Miniflare) | the **local** store, which must be seeded first |

### Why `.dev.vars` alone is not enough any more

A binding and a `.dev.vars` entry cannot coexist under one name. In local mode
Miniflare honours the `secrets_store_secrets` bindings by creating its own
*empty* store at `.wrangler/state/v3/secrets-store/` — and that empty binding
**shadows** the `.dev.vars` value. `env.BETTER_AUTH_SECRET` becomes a binding
whose `get()` yields nothing, so `createAuth()` throws
"BETTER_AUTH_SECRET is not set" even though `.dev.vars` clearly has it.

`pnpm dev:local` therefore runs `scripts/seed-local-secrets.mjs` first, which
mirrors `.dev.vars` into the local store. `.dev.vars` stays the single local
source of truth; run it manually after editing a value:

```bash
pnpm secrets:seed-local
```

It is idempotent (creates on first run, updates by `--secret-id` after), never
passes `--remote`, and reads the binding list out of `wrangler.json` so it
cannot drift from it.

### The name that trips this up

`astro dev` loads the **top-level (prod)** config, where the binding
`BETTER_AUTH_SECRET` points at the store secret **`BETTER_AUTH_SECRET_PROD`**.
The local store must hold the *secret_name*, not the *binding* name — seeding
`BETTER_AUTH_SECRET` produces:

```
Secret "BETTER_AUTH_SECRET_PROD" not found
```

For the other five the two names coincide, which is why this stays hidden until
it bites on the one secret that differs. The seed script handles the mapping;
it is called out here because the error message points at the store rather than
at the naming.

`.wrangler/state/` is gitignored, so seeded values never leave the machine.

### Verifying local auth works

```bash
pnpm dev:local
curl -s http://localhost:4321/api/auth/get-session                 # -> null
curl -s -X POST http://localhost:4321/api/auth/sign-in/social \
  -H 'Content-Type: application/json' \
  -d '{"provider":"google","callbackURL":"/"}'                     # -> {"url":"https://accounts.google.com/..."}
```

A `200` with a real `accounts.google.com` URL means all three auth secrets
resolved. A `500` means one did not — check the dev server log, which prints
the specific secret name and reason.

## Gotchas

- A Secrets Store binding and a per-Worker secret **cannot share a name** on
  one Worker. Deploying a binding removes the same-named per-Worker secret
  (verified on staging: `wrangler secret list` returned `[]` afterwards).
  The same collision is what breaks local dev — see "Local development".
- In local mode the binding **wins over `.dev.vars`** even when the local store
  is empty, so a missing seed looks identical to a missing secret. Run
  `pnpm secrets:seed-local` before blaming `.dev.vars`.
- `env.*` blocks in `wrangler.json` inherit nothing. Every binding must be
  repeated in each environment.
- `readSecret()` returns `undefined` when a binding fails rather than
  throwing, and logs the reason. A broken binding therefore looks like a
  missing secret to callers (`503`, "not configured") — check Worker logs
  (`wrangler tail`) rather than assuming the secret was never set.
- `bridgeCloudflareEnv()` must be awaited **before** the
  `import("../../mastra")` that constructs the agent. Mastra reads
  `process.env` synchronously, so a late bridge silently falls back to the
  default model.
