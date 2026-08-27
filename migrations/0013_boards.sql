-- Boards: the container primitive replacing `project` + `asset` + `moodboard_item`.
--
-- HAND-WRITTEN DELIBERATELY. `drizzle-kit generate` cannot be used to produce
-- this file. Migrations 0005_backfill_personal_orgs through 0012 were written by
-- hand and never recorded in migrations/meta/_journal.json, so drizzle's latest
-- snapshot was 0004 and it diffed against a schema that predates seven applied
-- migrations. The output re-emitted all of them -- including `DROP TABLE account`
-- / `session` / `member` / `invitation` as table rebuilds, which would have
-- logged out every user -- alongside a dozen ALTERs that already exist.
--
-- The journal has since been repaired: the generated snapshot was renumbered to
-- meta/0013_snapshot.json and its entry retagged `0013_boards` with idx 13, so
-- it now reflects the true current schema. Future `drizzle-kit generate` runs
-- diff against reality and can be trusted again. This file contains only the
-- five statements that were actually new.

CREATE TABLE `board` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`created_by` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`kind` text DEFAULT 'custom' NOT NULL,
	`view_mode` text DEFAULT 'grid' NOT NULL,
	`archived_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `board_org_updated_idx` ON `board` (`organization_id`,`updated_at`);--> statement-breakpoint
CREATE INDEX `board_owner_kind_idx` ON `board` (`created_by`,`kind`);--> statement-breakpoint
CREATE TABLE `board_item` (
	`id` text PRIMARY KEY NOT NULL,
	`board_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`url` text NOT NULL,
	`kind` text DEFAULT 'generation' NOT NULL,
	`generation_id` text,
	`character_id` text,
	`note` text,
	`sort_key` text NOT NULL,
	`width` integer,
	`height` integer,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`board_id`) REFERENCES `board`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`generation_id`) REFERENCES `generation`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`character_id`) REFERENCES `character`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `board_item_board_sort_idx` ON `board_item` (`board_id`,`sort_key`);--> statement-breakpoint
CREATE INDEX `board_item_board_created_idx` ON `board_item` (`board_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `board_item_org_created_idx` ON `board_item` (`organization_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `board_item_board_url_unique` ON `board_item` (`board_id`,`url`);--> statement-breakpoint
CREATE TABLE `board_member` (
	`board_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text DEFAULT 'view' NOT NULL,
	`invited_by` text,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`board_id`, `user_id`),
	FOREIGN KEY (`board_id`) REFERENCES `board`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`invited_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `board_member_user_idx` ON `board_member` (`user_id`);--> statement-breakpoint
ALTER TABLE `share_link` ADD `board_id` text;
