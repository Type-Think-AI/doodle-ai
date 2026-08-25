-- Migration: Drop FOREIGN KEY constraints from account, session, and member.
--
-- D1's batch API runs all statements in a single implicit transaction with
-- IMMEDIATE foreign key checking. Better Auth's drizzle adapter batches
-- user + account + session creation, where account.user_id references
-- user(id). The user row is inserted first but hasn't "committed" within the
-- batch's FK evaluation scope, so the constraint fails:
--
--   D1_ERROR: FOREIGN KEY constraint failed: SQLITE_CONSTRAINT
--
-- SQLite has no ALTER TABLE DROP CONSTRAINT. The only path is to recreate
-- the table without the FK. This preserves all columns, data, indices, and
-- defaults — only the FK declarations are removed. Better Auth manages
-- referential integrity at the application level (ON DELETE cascade semantics
-- are handled by its own delete hooks), so the DB-level FKs were defensive,
-- not load-bearing.
--
-- The migration is idempotent on a fresh database (the new CREATE TABLE
-- matches what 0000_init.sql + 0004_org_layer.sql would produce without FKs).

-- 1. account: drop FK(user_id) -> user(id)
PRAGMA defer_foreign_keys = ON;
CREATE TABLE `account_new` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`id_token` text,
	`password` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`issuer` text NOT NULL
);
INSERT INTO `account_new` SELECT * FROM `account`;
DROP TABLE `account`;
ALTER TABLE `account_new` RENAME TO `account`;

-- 2. session: drop FK(user_id) -> user(id)
CREATE TABLE `session_new` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token` text NOT NULL,
	`expires_at` integer NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`active_organization_id` text
);
INSERT INTO `session_new` SELECT * FROM `session`;
DROP TABLE `session`;
ALTER TABLE `session_new` RENAME TO `session`;
-- Restore the unique index on session token that Better Auth needs.
CREATE UNIQUE INDEX IF NOT EXISTS `session_token_unique` ON `session` (`token`);

-- 3. member: drop FK(organization_id) -> organization(id), FK(user_id) -> user(id)
CREATE TABLE `member_new` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	`created_at` integer NOT NULL
);
INSERT INTO `member_new` SELECT * FROM `member`;
DROP TABLE `member`;
ALTER TABLE `member_new` RENAME TO `member`;

-- 4. invitation: drop FK(organization_id) -> organization(id), FK(inviter_id) -> user(id)
CREATE TABLE `invitation_new` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`email` text NOT NULL,
	`role` text,
	`status` text NOT NULL,
	`expires_at` integer NOT NULL,
	`inviter_id` text NOT NULL,
	`created_at` integer NOT NULL
);
INSERT INTO `invitation_new` SELECT * FROM `invitation`;
DROP TABLE `invitation`;
ALTER TABLE `invitation_new` RENAME TO `invitation`;
