-- Migration: grant platform admin to the two owner accounts.
--
-- Chicken-and-egg: 0007 defaults every user to 'user', and only an existing
-- admin can promote anyone through PATCH /api/admin/users/:id/role. So the
-- first admins have to come from a migration.
--
-- Matching on email rather than id because the ids are Better Auth-generated
-- and differ per environment (local / staging / production), while these two
-- email addresses are the same everywhere.
--
-- Idempotent, and safe to run before either account exists: an UPDATE that
-- matches zero rows is a successful no-op, not an error. That matters because
-- the local and staging databases may not have these users signed up yet.
-- If a row is missed, signing in once and re-running
-- `wrangler d1 migrations apply` will NOT re-run this file (wrangler records
-- it as applied) — use the documented recovery path instead:
-- the ADMIN_BOOTSTRAP_EMAIL secret, see src/lib/auth/admin-guard.ts.

UPDATE `user` SET `platform_role` = 'admin' WHERE `email` = 'yhpatidar1999@gmail.com';
--> statement-breakpoint
UPDATE `user` SET `platform_role` = 'admin' WHERE `email` = 'yash@typethink.ai';
