# Tech stack (as of `dev`)

Canonical long-form decision record: **[../tech-stack.md](../tech-stack.md)**.

This page is a short, **`dev`-accurate** summary. Prefer `package.json` + `wrangler.json` when the older note disagrees.

## Honest drift

| Topic | On `dev` now | Older [../tech-stack.md](../tech-stack.md) / root README |
|---|---|---|
| Astro | **7.3.1** (`astro`), adapter `@astrojs/cloudflare` **14.3.0** | Still says **Astro 5** |
| Credits | Org ledger, signup **10**, **1 credit / image** | Architecture.md still sketches a user-id ledger; README still says 5 signup credits / 1-per-gen |
| Stripe | **Planned, not live** — no Stripe deps or `wrangler` bindings | Discussed as the payments choice; do not treat checkout as shipped |
| Neon / Postgres | **Not used.** D1 is the database. Neon is only the documented escape hatch | Comparison section is still valid as a *decision*, not a live vendor |
| Auth | Better Auth **1.7.1**, Google OAuth only | Mentions email/password + Apple as Better Auth capabilities; those are not wired |
| Voice | Cloudflare `@cloudflare/voice` + `VoiceRoom` | Not covered in the stack note |
| Secrets | Cloudflare Secrets Store bindings (plus `.dev.vars` locally) | Describes `wrangler secret put` |

## What is actually in the tree

| Layer | Choice on `dev` |
|---|---|
| App / SSR | Astro 7 + React 19 islands |
| Runtime | Cloudflare Workers (`nodejs_compat`), Wrangler 4 |
| Database | Cloudflare **D1** + **Drizzle** 0.45 / drizzle-kit |
| Sessions | KV `SESSIONS` (Better Auth secondary storage) |
| Auth | Better Auth, Google only |
| Agent | Mastra 1.61, `POST /api/chat` |
| Chat model | OpenRouter (`OPENROUTER_MODEL`, default Gemini 3.7 Flash) |
| Generation | PicX (`picx-ai`), server-owned key |
| Canvas | tldraw 5.3, **one** island; DO sync rooms |
| Object storage | PicX CDN for doodles; R2 `ROADMAP_ASSETS` for roadmap binaries |
| Edge AI | Workers AI binding — current Cloudflare voice STT/TTS |
| Payments | **Not live.** Stripe remains the documented direction |
| Package manager | pnpm, Node `>=22` |

## Credits (do not invent)

From `src/lib/credits/costs.ts` and `src/db/schema/billing.ts`:

- Organization-owned ledger (`credit_ledger.organizationId`).
- Signup grant: **10**.
- **1 credit per generated image**; packs are `imageCount × 1`.
- Stripe purchase/subscription tables may exist in schema for the planned path; there is no live Stripe webhook or checkout binding.

## Pointers

- System diagram: [overview.md](./overview.md)
- Bindings: [services.md](./services.md)
- Deploys: [../deploys.md](../deploys.md)
- Secrets: [../secrets.md](../secrets.md)
- Decision rationale (D1 vs Neon, Stripe vs MoR): [../tech-stack.md](../tech-stack.md)
