# Deploys

One script owns every deploy: `scripts/deploy.mjs`. It **migrates, then deploys, then
verifies**, and it refuses to continue if any step fails.

```bash
pnpm deploy:staging          # dev  → doodleai-staging  → dev.doodleai.art
pnpm deploy                  # main → doodleai          → doodleai.art

pnpm db:pending              # read-only: what would production migrate?
pnpm db:pending:staging

node scripts/deploy.mjs production --dry-run   # print the plan, change nothing
```

## Why the script exists

`package.json` used to chain a migration before `wrangler deploy`, which covered a
deploy run by hand. **Cloudflare Workers Builds deploys on every push using its own
command**, which was a bare `wrangler deploy`. So a git-triggered release shipped new
code against an unmigrated database and failed at runtime on a table it expected and
the database did not have. Both paths now run the same script.

## Order: migrate, then deploy

Migrations in this repo are additive by convention (see the headers of
`migrations/0012` and `0015`). Old code tolerates the new schema; new code does not
tolerate the old one. Migrating first means the gap between the two steps can only
fail in the safe direction.

**A non-additive migration cannot ship this way.** A rename, a drop, or adding
`NOT NULL` to an existing column needs an expand/contract pair across two deploys:
first a deploy that adds and dual-writes, then one that removes.

## What it guards against

| Guard | Failure it prevents |
|---|---|
| Unknown/unmapped branch is refused | A feature branch migrating the live database |
| No target and no branch → refused | Defaulting to production when the target is ambiguous |
| `ALLOWED_DATABASE` cross-check | A bad merge pointing staging's binding at `doodleai` |
| `CLOUDFLARE_ACCOUNT_ID` pinned from config | Deploying into the wrong Cloudflare account |
| Migration failure aborts before deploy | Shipping code against a schema that was not applied |
| Post-deploy `/api/status` check | A deploy that "succeeded" but does not serve |

The account pin is not just convenience. Remote D1 commands cannot choose an account
non-interactively when the credential can see more than one, and wrangler.json's
top-level `account_id` does **not** satisfy them — verified against wrangler 4.88,
where both the production and staging paths fail with it present:

```
✘ More than one account available but unable to select one in non-interactive mode.
```

The script sets `CLOUDFLARE_ACCOUNT_ID` from `wrangler.json`, so the target is
deterministic instead of dependent on whatever `wrangler login` last selected. An id
already in the environment wins, so CI can override.

## Wrangler behaviour this relies on

From `wrangler d1 migrations apply --help`:

- In a **non-interactive shell the confirmation prompt is skipped**, so no `--yes`
  flag is needed (and none exists).
- **A backup is captured** before applying.
- **A failed migration is rolled back**, leaving the previous one applied.

## Workers Builds configuration

This is the one part not in the repo — it lives in the Cloudflare dashboard, under
**Workers & Pages → doodleai-agent → Settings → Builds**.

Set the deploy command per branch:

| Branch | Build command | Deploy command |
|---|---|---|
| `main` | `pnpm install && pnpm build` | `pnpm exec node scripts/deploy.mjs production --skip-build` |
| `dev` | `pnpm install && pnpm build` | `pnpm exec node scripts/deploy.mjs staging --skip-build` |

`--skip-build` because Workers Builds already ran the build step. If you would
rather have one command for both branches, use
`pnpm exec node scripts/deploy.mjs --skip-build` and let it infer the environment
from `WORKERS_CI_BRANCH` — it maps `main → production`, `dev → staging`, and refuses
anything else.

**The build's API token needs `D1:Edit`** in addition to Workers deploy permission.
Without it the migration step fails and, correctly, nothing deploys.

## Local development

```bash
pnpm db:migrate:local        # apply to the local miniflare D1
pnpm dev:local               # migrates, then starts astro dev
```

`wrangler.local.json` declares `migrations_dir` explicitly. It is not strictly
required — wrangler defaults to `migrations` — but stating it means a future config
edit cannot silently turn local migrations into a no-op, which fails as a stale
schema with no error.
