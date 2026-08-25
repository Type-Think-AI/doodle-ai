-- DATA ONLY. No schema changes here — 0004_org_layer.sql already created
-- every table and column this touches. Deliberately absent from
-- migrations/meta/_journal.json: wrangler applies every .sql file in this
-- directory in filename order and tracks its own applied-set in D1's
-- `d1_migrations` table, while drizzle-kit only reads the journal to decide
-- what schema state future `db:generate` diffs against — a data-only file
-- has no schema to diff, so leaving it out of the journal is correct, not
-- an oversight. Confirmed with `pnpm db:generate` producing an empty diff
-- after adding this file.
--
-- Every statement below is idempotent. There are no transactions on D1
-- (Drizzle's driver has no db.transaction(); see src/lib/credits/index.ts
-- for the load-bearing explanation of why db.batch() is the only atomicity
-- primitive available), and wrangler re-runs a whole migration file on
-- partial failure — so re-runnability IS the atomicity story here, not a
-- nice-to-have. Running this file a second time against an already-backfilled
-- database must change zero rows; that is the actual verification step for
-- this migration (see the plan's Phase B row).
--
-- Deterministic ids (`org_<userId>`, `mem_<userId>`) so this file can never
-- disagree with the databaseHooks.user.create.after hook in
-- src/lib/auth/index.ts, which creates the same rows going forward for any
-- user who signs up in the gap between this migration landing and the next
-- `wrangler deploy` completing. requireOrg() (src/lib/auth/guards.ts)
-- self-heals the same shape as a last-resort backstop if both somehow miss
-- a user.

-- 1. One personal org per existing user who doesn't already have a membership.
INSERT OR IGNORE INTO organization (id, name, slug, logo, created_at, is_personal)
SELECT
  'org_' || u.id,
  COALESCE(NULLIF(u.name, ''), u.email) || '''s Team',
  'u-' || u.id,
  u.image,
  u.created_at,
  1
FROM user u
WHERE NOT EXISTS (SELECT 1 FROM member m WHERE m.user_id = u.id);

-- 2. Owner membership for that org.
INSERT OR IGNORE INTO member (id, organization_id, user_id, role, created_at)
SELECT
  'mem_' || u.id,
  'org_' || u.id,
  u.id,
  'owner',
  u.created_at
FROM user u
WHERE EXISTS (SELECT 1 FROM organization o WHERE o.id = 'org_' || u.id);

-- 3. Attribute every historical ledger row to the personal org of the user
--    who was the row's `userId` (now documented as "the acting member" —
--    see src/db/schema/billing.ts). Only touches rows the org-credits code
--    hasn't already scoped.
UPDATE credit_ledger
SET organization_id = 'org_' || user_id
WHERE organization_id IS NULL;

-- 4. Rebuild org balances FROM THE LEDGER, never by copying the legacy
--    credit_balance cache — reconcile.ts's standing rule is that the ledger
--    is authoritative and every cache is rebuilt from it, not the reverse.
INSERT INTO credit_balance_org (organization_id, balance, updated_at)
SELECT organization_id, SUM(delta), unixepoch() * 1000
FROM credit_ledger
WHERE organization_id IS NOT NULL
GROUP BY organization_id
ON CONFLICT(organization_id) DO UPDATE SET
  balance = excluded.balance,
  updated_at = excluded.updated_at;

-- 5. Product rows — org-scope everything that was created before this
--    migration ran. These columns are nullable forever (see the file
--    header in src/db/schema/product.ts); this is a one-time catch-up, not
--    an invariant this migration is establishing going forward.
UPDATE thread         SET organization_id = 'org_' || user_id WHERE organization_id IS NULL;
UPDATE generation     SET organization_id = 'org_' || user_id WHERE organization_id IS NULL;
UPDATE moodboard_item SET organization_id = 'org_' || user_id WHERE organization_id IS NULL;
UPDATE character      SET organization_id = 'org_' || user_id WHERE organization_id IS NULL;
UPDATE feedback       SET organization_id = 'org_' || user_id WHERE organization_id IS NULL;
