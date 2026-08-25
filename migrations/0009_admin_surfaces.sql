-- Migration: admin surfaces — audit log, skill state, feedback triage.
--
-- Three independent additions, grouped because they all exist to back the
-- Phase 2 admin console and none of them touch existing data:
--
--  1. `admin_audit_log` — new table. Every privileged admin action.
--  2. `skill_state`     — new table. Admin-flippable live/paused + featured.
--  3. `feedback.status` / `.triaged_by` / `.triaged_at` — new columns so the
--     feedback inbox has somewhere to record triage.
--
-- No FOREIGN KEY declarations on the new tables, deliberately — consistent
-- with 0006_drop_foreign_keys.sql, which removed them from account/session/
-- member because D1's batch API evaluates FKs immediately and breaks
-- multi-insert batches. Referential integrity for these is enforced in
-- application code. `admin_audit_log.actor_user_id` in particular must
-- survive the referenced user being deleted: an audit trail that erases
-- itself when the actor closes their account is not an audit trail.

CREATE TABLE `admin_audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_user_id` text NOT NULL,
	`action` text NOT NULL,
	`target_type` text,
	`target_id` text,
	`detail` text,
	`ip_address` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_actor_created_idx` ON `admin_audit_log` (`actor_user_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `audit_created_idx` ON `admin_audit_log` (`created_at`);
--> statement-breakpoint
CREATE INDEX `audit_target_idx` ON `admin_audit_log` (`target_type`,`target_id`);
--> statement-breakpoint

CREATE TABLE `skill_state` (
	`skill_id` text PRIMARY KEY NOT NULL,
	`state` text DEFAULT 'live' NOT NULL,
	`featured` integer DEFAULT false NOT NULL,
	`note` text,
	`updated_by` text,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint

-- Feedback triage. Defaults chosen so every historical row reads as
-- untriaged, which is accurate — there was no UI to triage them with.
ALTER TABLE `feedback` ADD COLUMN `status` text DEFAULT 'new' NOT NULL;
--> statement-breakpoint
ALTER TABLE `feedback` ADD COLUMN `triaged_by` text;
--> statement-breakpoint
ALTER TABLE `feedback` ADD COLUMN `triaged_at` integer;
--> statement-breakpoint
CREATE INDEX `feedback_status_created_idx` ON `feedback` (`status`,`created_at`);
