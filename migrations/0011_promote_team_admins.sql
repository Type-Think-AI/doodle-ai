-- Migration: grant platform admin to additional team members.
--
-- Same pattern as 0008_seed_first_admin.sql — matching on email,
-- idempotent (no-op if account hasn't signed up yet).
-- Recovery path for missed rows: ADMIN_BOOTSTRAP_EMAIL secret.

UPDATE `user` SET `platform_role` = 'admin' WHERE `email` = 'vanshika@typethink.ai';
--> statement-breakpoint
UPDATE `user` SET `platform_role` = 'admin' WHERE `email` = 'arpit@typethink.ai';
