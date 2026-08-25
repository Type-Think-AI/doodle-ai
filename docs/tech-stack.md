# Doodle AI — SaaS Tech Stack

> **Status:** current-state and decision document. The platform-credit migration is implemented; Stripe checkout remains planned.
> **Companions:** [architecture.md](./architecture.md) · [roadmap.md](./roadmap.md) · [mobile-strategy.md](./mobile-strategy.md)

## 1. Why we're doing this

The current Doodle AI path is session-authenticated generation backed by the server-owned PicX secret. Users never enter provider credentials. Signed-in work is synchronized across devices, and each generation is metered through the account credit ledger. Chats, moodboards, and characters retain a local mirror for responsive UI while server-backed stores provide cross-device persistence.

The current architecture:

- **The Worker holds the PicX key server-side.** It is never sent to a browser.
- **Users sign in to create.** Their work and generation history are account-scoped.
- **Consumption is metered in credits**, with Stripe purchase flows still planned.
- **The same HTTP API serves a future native mobile app** — designed in from day one, not retrofitted.

## 2. Constraints that make this comparison non-generic

Any stack recommendation that ignores these is wrong for us.

**No raw TCP sockets on Cloudflare Workers.** This is the single biggest filter. A normal `pg` client cannot open a connection. Postgres is reachable only via an HTTP query API (Neon's serverless driver, Supabase PostgREST) or through **Cloudflare Hyperdrive**, which pools and caches at the edge. Anything assuming a long-lived pooled TCP connection is out.

**Auth must be edge-verifiable.** Astro SSR on Workers means cookie- or JWT-based sessions with no Node-only middleware. Sessions verified per request, with no in-process session store surviving between invocations.

**Bundle size is already a live problem.** `astro.config.mjs` carries a 15-entry `vite.ssr.external` list purely to stop Rollup choking on `@mastra/core`'s Node-only `execa`/`@ast-grep/napi` dependency chain. Every dependency we add risks that build. Prefer libraries with tree-shakeable or Workers-native entry points.

**Image bytes never touch our database.** Uploads go to PicX managed assets (`src/pages/api/upload.ts`) and outputs live on `cdn.picxstudio.com`. Our database stores *metadata and money* — small rows, high count. That reshapes the sizing math completely.

**A credit ledger is financial data.** Correctness under concurrency is a hard requirement, not a nice-to-have. A double-spend or a double-credit on a retried webhook is a real bug with real cost.

## 3. Database comparison

### The candidates

| | **Cloudflare D1** | **Neon** | **Supabase** | **Turso** | **PlanetScale** |
|---|---|---|---|---|---|
| Engine | SQLite | Postgres | Postgres | SQLite (libSQL) | MySQL / Postgres |
| Workers access | **Native binding** — no network hop | HTTP driver (`neon-http`) | HTTP (PostgREST / `postgres.js` over Hyperdrive) | HTTP | Hyperdrive / HTTP |
| Cold start | **None** | Low (scale-to-zero wake ~500ms) | None (always-on compute) | None | None |
| Ceiling | **10 GB / database** | TBs | TBs | ~ per-DB SQLite limits | TBs |
| Write model | **Single writer, serialized** | MVCC | MVCC | Single writer | MVCC |
| Bundled auth/storage | No | No | **Yes** | No | No |
| Migrations | `wrangler d1 migrations apply` | any Postgres tool | any Postgres tool | Turso CLI | Deploy requests |
| Branching / preview DBs | Limited | **Best in class** | Yes | Yes | Yes |
| New vendor + billing relationship | **No** | Yes | Yes | Yes | Yes |
| Egress cost | **Zero** | Metered | Metered | Metered | Metered |

### D1's real limits (from [Cloudflare's limits page](https://developers.cloudflare.com/d1/platform/limits/), verified Aug 2026)

These are the numbers that decide whether D1 is viable, so they're worth stating exactly rather than hand-waving:

| Limit | Workers Paid | Free |
|---|---|---|
| Max database size | **10 GB** | 500 MB |
| Databases per account | 50,000 | 10 |
| Total storage per account | 1 TB | 5 GB |
| Max row / string / BLOB | **2 MB** | 2 MB |
| Queries per Worker invocation | 1,000 | 50 |
| Max query duration | 30 s | 30 s |
| Concurrent connections per Worker | **6** | 6 |
| Bound parameters per query | 100 | 100 |
| Columns per table | 100 | 100 |
| Time Travel (point-in-time restore) | 30 days | 7 days |

Two of these matter more than the rest:

**Each D1 database is single-threaded — it processes one query at a time.** Throughput is therefore a function of query duration: ~1 ms queries ≈ ~1,000 queries/second, ceiling. This is the number to watch, not the 10 GB.

**Read replication exists but is opt-in.** D1 can place read replicas globally, but replicas are only used if you go through the [Sessions API](https://developers.cloudflare.com/d1/best-practices/read-replication/). Without it every query — read or write — goes to the primary. If we adopt D1, we should adopt the Sessions API at the same time; it's the cheapest latency win available on this stack.

### How the workload actually sizes

Our rows are metadata. A realistic estimate per row:

| Table | Bytes/row (est.) | Rows per active user/month |
|---|---|---|
| `generation` | ~600 (prompt text + two URLs + ids) | ~30 |
| `message` | ~400 | ~60 |
| `credit_ledger` | ~150 | ~35 |
| `moodboard_item` | ~120 | ~20 |

At **10,000 monthly active users** generating at that rate, that's roughly **~450 MB/year** of growth. 10 GB is on the order of a decade of runway at that scale, or ~2 years at 50k MAU — and message/generation history is prunable or archivable to R2 long before that.

The write-throughput ceiling binds first. 1,000 writes/sec against a workload where each generation produces maybe 5 writes means ~200 generations/second sustained — far beyond where PicX generation cost and rate limits would already be the bottleneck.

### Recommendation: **Cloudflare D1 + Drizzle ORM**

**Why:**

1. **It adds zero vendors.** No new billing relationship, no new dashboard, no new secret, no new status page to watch. It's a binding in `wrangler.json`.
2. **Zero egress, zero cold start, zero network hop.** The Worker talks to D1 over Cloudflare's internal fabric. Neon-over-HTTP adds a real round trip on every query; at 3–5 queries per request that's measurable.
3. **The workload genuinely fits**, per the sizing above. Image bytes — the only thing that would blow up the size — live on PicX's CDN.
4. **SQLite's single-writer model is an asset here, not a liability.** For a credit ledger, serialized writes mean lost-update races on balance decrements are structurally impossible. On Postgres we would have to reach for `SELECT ... FOR UPDATE` or `SERIALIZABLE` isolation and get it right; on D1 the engine does it for us. This is a real correctness advantage for the one part of the system where correctness is money.
5. **Time Travel gives us 30-day point-in-time restore for free**, which for financial data would otherwise be a backup strategy we'd have to design.
6. **The escape hatch is designed in.** Drizzle's schema definition and query builder are near-identical between `drizzle-orm/d1` and `drizzle-orm/neon-http`. Migrating means swapping the dialect import, regenerating migrations against the Postgres dialect, and moving the data — not rewriting the data layer.

**The conditions that would reverse this decision.** Write these down now so the trigger is recognized rather than argued about later:

- Sustained write throughput approaching the single-writer ceiling (watch p99 D1 query duration in Workers observability — it's already enabled in `wrangler.json`).
- Database size crossing ~7 GB with no prunable history.
- Needing real analytical queries — window functions over millions of rows, complex multi-table joins for a usage dashboard. SQLite will do them; it will do them slowly, on the one thread that also serves production writes.
- Needing a second consumer of the database (a data warehouse sync, an internal admin service). D1's binding-only access model makes that awkward.

**The honest counter-argument.** If the near-term plan already includes a serious analytics/reporting surface, or you expect to be past 50k MAU inside a year, **start on Neon instead and skip the migration entirely.** Neon is real Postgres, its HTTP driver works natively in Workers, it scales to zero so the idle cost is comparable, and its branching gives every preview deploy its own database. The cost of starting on Neon is one extra vendor and a network hop per query. The cost of starting on D1 and being wrong is a migration under load.

Both are defensible. D1 is recommended because the current workload is small, financial correctness is easier there, and the escape hatch is cheap — but this is a genuine fork, not a formality.

**Not recommended:** *Supabase* — its bundled auth would compete with Better Auth (see below) and we'd end up using ~20% of the platform while paying for the rest. *Turso* — same SQLite tradeoffs as D1 but with an added vendor and no native binding; it only wins if we need per-tenant database sharding, which we don't. *PlanetScale* — MySQL/Vitess is built for a scale problem we do not have, and its deploy-request migration workflow is friction we don't need.

## 4. The rest of the stack

| Layer | Choice | Why |
|---|---|---|
| **ORM + migrations** | **Drizzle** + `drizzle-kit` | SQL-first (no query-engine binary, unlike Prisma — which matters on Workers), generates versioned SQL migration files that `wrangler d1 migrations apply` runs directly, and portable to Postgres if we take the escape hatch. TypeScript schema is the single source of truth. |
| **Auth** | **Better Auth** with `drizzleAdapter` | Runs on Workers, owns its tables inside *our* database (so `user.id` is a real foreign key from `credit_ledger` — no cross-service join), supports email/password + Google/Apple OAuth, and **issues bearer tokens**, which is precisely what the mobile app needs. Use the `better-auth/minimal` entry point (v1.5+) to tree-shake unused features and keep the Worker bundle down. |
| **Session cache** | Cloudflare **KV** as `secondaryStorage` | Avoids a D1 read on every authenticated request. **Known issue:** Better Auth #4203 (reopened Jan 2026) — with `cookieCache` enabled *alongside* `secondaryStorage`, it fails to fall back to secondary storage after the cookie cache expires. **Pick one, not both.** Recommend `secondaryStorage` alone. |
| **Payments** | **Stripe** — Checkout for credit packs, Billing for subscriptions, webhooks into the ledger | Confirmed US/EU billing entity selling globally, so Merchant-of-Record is unnecessary overhead. Stripe has the best API, the best metering/credit primitives, and Stripe Tax handles compliance. See the note below. |
| **Secrets + model config** | `wrangler secret put` for `PICX_API_KEY` and `OPENROUTER_API_KEY`; `OPENROUTER_MODEL` selects the provider/model ID | The platform-owned PicX key is the only provider credential used for generation. `OPENROUTER_MODEL` defaults to `google/gemini-3.7-flash`. Note `src/lib/env-bridge.ts` handles the Workers-env → `process.env` bridge that Mastra needs. |
| **Rate limiting** | Workers **Rate Limiting binding**, or a KV counter | Free-tier credits are an abuse magnet. Limit per-IP signups and per-user generations/minute. |
| **Object storage** | Stay on PicX CDN | Deliberately out of scope. **R2** is the option if we ever need to own the assets (user deletion guarantees, or PicX CDN dependency risk). Note it, don't build it. |
| **Email** | Resend or Cloudflare Email Routing | Needed by Better Auth for verification and password reset. Small decision, defer to build time. |

### A note on the payments research

The comparison sources for Merchant-of-Record alternatives (Paddle, Dodo, Lemon Squeezy) were overwhelmingly **Dodo Payments' own marketing blog**, which is not a neutral source. That said, the conclusion for *our* case doesn't depend on it: MoR exists primarily to solve global sales-tax compliance and payout access for entities in jurisdictions where Stripe is constrained (India being the common example). With a US/EU entity, Stripe direct + Stripe Tax is straightforwardly the better option — better API, better credit/metering tooling, lower fees, and no revenue-share intermediary.

Keep the billing layer thin and abstracted anyway (`src/lib/billing/`), so swapping providers is a contained change rather than a rewrite.

## 5. Cost model

Rough monthly infrastructure spend. Assumes ~30 generations per MAU per month.

| | 1k MAU | 10k MAU | 100k MAU |
|---|---|---|---|
| **Workers Paid** | $5 | $5 | ~$25 (request overage) |
| **D1** | included | ~$5 | ~$40 |
| **KV** | included | ~$5 | ~$20 |
| **D1 + Workers total** | **~$5** | **~$15** | **~$85** |
| *Alt: Neon* | ~$19 | ~$69 | ~$300+ |
| *Alt: Supabase* | ~$25 | ~$100 | ~$500+ |

Infrastructure is **not** the cost driver. **PicX generation cost is.** At 30 generations/MAU/month, 10k MAU is 300,000 generations/month — if each costs even $0.02, that's $6,000/month against ~$15 of database spend.

**The implication for pricing:** set the credit price from PicX unit cost plus margin, and treat the database choice as a rounding error. This is also the strongest practical argument for D1 — not that it's cheap, but that it's cheap enough to stop thinking about, so attention goes to the cost that actually matters. Free-tier starter credits must be sized against generation cost, not signup volume.

## 6. Decision summary

| Question | Answer |
|---|---|
| Runtime | Astro 5 + Cloudflare Workers — **unchanged**, no rewrite |
| Database | **Cloudflare D1**, with Neon as the documented escape hatch |
| ORM | **Drizzle** + `drizzle-kit` |
| Auth | **Better Auth**, cookies for web + bearer tokens for mobile |
| Payments | **Stripe** direct (US/EU entity, no MoR) |
| Metering | Append-only **credit ledger** — see [architecture.md](./architecture.md) |
| Mobile | **Expo**, reusing `/api/v1` — see [mobile-strategy.md](./mobile-strategy.md) |
| Sequencing | Six shippable phases — see [roadmap.md](./roadmap.md) |

## Sources

- [Cloudflare D1 limits](https://developers.cloudflare.com/d1/platform/limits/)
- [D1 global read replication](https://developers.cloudflare.com/d1/best-practices/read-replication/)
- [Cloudflare D1 vs Neon vs Supabase Postgres 2026 — DevToolReviews](https://www.devtoolreviews.com/reviews/cloudflare-d1-vs-neon-vs-supabase-postgres-2026)
- [Neon vs Supabase vs Turso 2026 — PkgPulse](https://www.pkgpulse.com/guides/neon-vs-supabase-vs-turso-2026)
- [Scaling Cloudflare D1 from 10 GB to 500 GB with manual sharding](https://medium.com/@tristantrommer/scaling-cloudflare-d1-from-10-gb-to-500-gb-with-manual-database-sharding-4e95d6deb742)
- [better-auth-cloudflare](https://github.com/zpg6/better-auth-cloudflare) · [Better Auth on Cloudflare — Hono docs](https://hono.dev/examples/better-auth-on-cloudflare)
- [Stripe vs Paddle 2026: fees, tax handling & MoR compared](https://designrevision.com/blog/stripe-vs-paddle) *(and Dodo Payments' comparison blog — vendor-authored, treated with caution)*
