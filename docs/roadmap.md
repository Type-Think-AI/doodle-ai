# Doodle AI — SaaS Migration Roadmap

> **Status:** Phases 1–4 and 6 implemented in this working tree. Phase 5 (Stripe checkout and subscription flows) and the mobile app are out of scope for now — deliberately skipped, not scheduled.
> **Prerequisites:** [tech-stack.md](./tech-stack.md) · [architecture.md](./architecture.md)

## Principle

**The platform-owned PicX connection and account credits are now the only generation path.** Every generation and upload is session-authenticated; provider credentials never reach the browser. Phases 1–3 provide persistence and auth, Phase 4 provides credits, and Phase 5 adds paid credit packs.

---

## Phase 1 — Foundation

*Database exists. Nothing user-visible changes.*

- Add `drizzle-orm`, `drizzle-kit`. Create `drizzle.config.ts`.
- `wrangler d1 create doodleai` → add the `d1_databases` binding to `wrangler.json`.
- Write `src/db/schema/{auth,billing,product}.ts` per [architecture.md](./architecture.md#2-schema).
- Generate and apply migration `0000_init` to local and remote.
- Add a `src/db/client.ts` helper that builds a Drizzle client from `context.locals.runtime.env.DB`.
- Add the D1 **Sessions API** wrapper from the start — retrofitting read replication later means touching every query.

**Exit criteria:** `pnpm check` passes (build + `tsc` + `wrangler deploy --dry-run`). Migrations apply cleanly to remote. A throwaway route can read and write a row. **The `vite.ssr.external` workaround in `astro.config.mjs` still holds** — verify explicitly, this is the phase most likely to break the build.

**Rollback:** revert the commit. The D1 database sits unused; no user impact.

---

## Phase 2 — Authentication

*Users can create accounts. Accounts do nothing yet; creation is unlocked by sign-in.*

- Add `better-auth` (use the `better-auth/minimal` entry point). Configure `drizzleAdapter` against D1.
- `npx @better-auth/cli generate` → auth tables → migration `0001_auth`.
- Mount the handler at `/api/auth/*`. Email/password + Google OAuth.
- **Enable the bearer-token plugin now, not later.** The mobile app depends on it, and adding it after sessions are in production means a second auth path to test. See [mobile-strategy.md](./mobile-strategy.md).
- KV namespace as `secondaryStorage` for session caching. **Do not also enable `cookieCache`** — see the Better Auth #4203 note in [tech-stack.md](./tech-stack.md#4-the-rest-of-the-stack).
- Build `/signin`, `/signup`; add an auth state slot in the sidebar.
- `GET /api/v1/me` returns profile only (no credits yet).
- Add `requireAuth()` and `optionalAuth()` helpers accepting both cookie and bearer.

**Exit criteria:** sign up, sign out, sign in, OAuth round-trip, session survives a Worker cold start, `/api/v1/me` works with *both* a cookie and a bearer token. Signed-out users still use the app exactly as before.

**Rollback:** revert. Auth tables remain, unused.

---

## Phase 3 — Server-side persistence

*Signed-in users' work follows them across devices. Signed-out users keep localStorage.*

- Implement `/api/v1/threads`, `/messages`, `/moodboard`, `/characters` with ownership checks on every row.
- Refactor `chat-store.ts`, `moodboard.ts`, `character-store.ts` to route to the API when signed in and `localStorage` when not — **keeping their exported function signatures unchanged**, so the calling pages barely move.
- `POST /api/v1/import` plus a one-time "We found work on this device — import it?" prompt on first sign-in. Existing users must not lose their threads.
- Lift the 24-item moodboard cap for signed-in users.

**Exit criteria:** create a thread signed-in on one browser, see it on another. Import carries local threads, moodboard and characters across intact. Signed-out flow is untouched. Ownership checks verified — user A cannot read user B's thread by id.

**Rollback:** revert the client changes; server data is preserved for the retry.

---

## Phase 4 — Credits *(the friction goes away)* ✅

*Signed-in users generate without ever entering an API key.* Implemented in this working tree.

- `PICX_API_KEY` is a server-owned secret. `src/mastra/tools/generate-doodle.ts` reads it from request context. Missing configuration is a server error; exhausted balances return `insufficient-credits`.
- Credit ledger: `src/lib/credits/` with `grant()`, `spend()`, `refund()`, `getBalance()` — every one idempotency-keyed, per [architecture.md](./architecture.md#3-the-credit-ledger).
- The reserve → generate → refund-on-failure path is wired into `/api/chat` (which fronts both generation and upload).
- Per-skill credit costs in `src/lib/credits/costs.ts`, resolved **server-side** from the skill id.
- Signup grant on account creation, via a Better Auth `databaseHooks.user.create.after` hook.
- Rate limiting: per-IP signup (Better Auth's native `rateLimit`, KV-backed) and per-user generations/minute (`src/lib/kv-counter.ts`'s `kvIncrement()`, checked in `generate-doodle.ts` before any ledger write — a rate-limited request never spends a credit or writes a `generation` row).
- Hourly Cron Trigger for the reconciliation job: `src-worker/entry.ts` wraps Astro's build output with a `scheduled()` handler (the Cloudflare adapter has no native support for one) and `wrangler.json` declares `triggers.crons: ["0 * * * *"]`.
- UI: balance in the sidebar (`GET /api/v1/me`'s `credits.balance`), a `credits` event on the NDJSON stream updating it live via a `doodleai:credits` window event, and an out-of-credits visual state — honest about there being no purchase flow yet, since Phase 5 is skipped.

**Exit criteria:** a brand-new account signs up and generates a doodle with no API key. Balance decrements correctly. A forced PicX failure refunds. Twenty concurrent requests on a 1-credit balance produce exactly one generation. Reconciliation job runs clean. All verified live against the shared staging D1/KV (see `pnpm dev`'s workflow) — not just compiled.

**Rollback:** disable generation while preserving ledger data; restoring a client credential path is intentionally not part of the rollback plan.

---

## Phase 5 — Payments

*Users can buy credits.*

- Add `stripe`. Secrets: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`.
- Products and prices in Stripe for credit packs; optionally a subscription tier with a monthly grant.
- `POST /api/v1/credits/checkout` → Checkout session. `POST /api/v1/webhooks/stripe` → signature-verified, `webhook_event` replay guard, ledger grant.
- Handle `checkout.session.completed`, `invoice.paid`, `customer.subscription.updated|deleted`, `charge.refunded`.
- Enable Stripe Tax (US/EU entity, selling globally — see [tech-stack.md](./tech-stack.md#a-note-on-the-payments-research)).
- UI: pricing page, `/settings` billing tab, transaction history from `/api/v1/credits/ledger`.
- Keep the billing layer behind `src/lib/billing/` so the provider is swappable.

**Exit criteria:** test-mode purchase credits the account exactly once. **Replaying the same webhook event does not double-credit.** Subscription renewal grants once per period. A refund debits correctly. Stripe CLI webhook replay is the required test, not an optional one.

**Rollback:** hide the purchase UI. Webhooks keep processing so nothing in flight is lost.

---

## Phase 6 — Platform-credit-only generation ✅

*One product, one path.* Implemented in this working tree.

- Removed the old Settings credential form and the `doodleme_api_key` storage constant.
- Removed client credential fields from chat and upload requests and removed the legacy unmetered generation route.
- Required sign-in for uploads and generation; signed-out actions open the shared auth dialog.
- Routed every image request through the server-owned PicX secret and the authenticated credit ledger.
- Updated privacy, terms, about, README, and architecture documentation.

**Exit criteria:** no `doodleme_api_key` reference remains in `src/`; typecheck/build validation passes; signed-out visitors receive a clear sign-in prompt rather than a broken generate state.

**Rollback:** generation can be disabled while preserving ledger data; restoring a client credential path is intentionally not supported.

---

## Sequencing notes

**Phases 1–2 can be built in parallel with Phase 3 design.** Phase 4 depends hard on 1, 2 and 3. Phase 5 depends on 4. Phase 6 should lag 5 by weeks, not days — in practice, Phase 5 was skipped entirely and Phase 6 shipped directly after Phase 4, which the original sequencing advice didn't anticipate; revisit that guidance if Phase 5 is picked back up later.

**The mobile app can start after Phase 4** — the API surface is complete and credit-metered by then. Payments on mobile have their own constraints; see [mobile-strategy.md](./mobile-strategy.md). Not started, and out of scope for now.

**Run `pnpm check` after every dependency addition.** The `vite.ssr.external` list in `astro.config.mjs` exists because `@mastra/core` statically imports Node-only tooling that Cloudflare's bundler can't resolve. Drizzle, Better Auth and Stripe are all Workers-compatible, but their transitive dependencies are where a build break will come from, and it will show up at bundle time rather than in editor types.

**Existing users are the constraint that shapes this whole plan.** Their threads, moodboards and characters live only in their browser. Phase 3's import step is the one piece of this roadmap with no second chance — if it ships broken, the data is gone.
