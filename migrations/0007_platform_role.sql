-- Migration: add `user.platform_role` — the global admin/support/user axis.
--
-- This is the PLATFORM role and has nothing to do with `member.role`, which
-- is the per-organization team position (owner|producer|artist|reviewer|
-- client). See the doc comment on `user.platformRole` in
-- src/db/schema/auth.ts for why the two are separate columns on separate
-- tables rather than one shared "role".
--
-- Safe on a live database: purely additive, has a NOT NULL DEFAULT, so
-- SQLite fills every existing row without a table rebuild and without
-- rewriting page data for the FK-free `user` table. No downtime.
--
-- Every pre-existing user therefore becomes 'user' — i.e. nobody has admin
-- access the instant this lands. 0008_seed_first_admin.sql is what grants it,
-- and it must run in the same `wrangler d1 migrations apply` invocation.

ALTER TABLE `user` ADD COLUMN `platform_role` text DEFAULT 'user' NOT NULL;
--> statement-breakpoint
CREATE INDEX `user_platform_role_idx` ON `user` (`platform_role`);
