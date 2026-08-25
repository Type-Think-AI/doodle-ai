CREATE TABLE `invitation` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`email` text NOT NULL,
	`role` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`inviter_id` text NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`inviter_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `invitation_organization_idx` ON `invitation` (`organization_id`);--> statement-breakpoint
CREATE INDEX `invitation_email_idx` ON `invitation` (`email`);--> statement-breakpoint
CREATE TABLE `member` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `member_organization_idx` ON `member` (`organization_id`);--> statement-breakpoint
CREATE INDEX `member_user_idx` ON `member` (`user_id`);--> statement-breakpoint
CREATE TABLE `organization` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`logo` text,
	`created_at` integer NOT NULL,
	`metadata` text,
	`is_personal` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `organization_slug_unique` ON `organization` (`slug`);--> statement-breakpoint
CREATE TABLE `credit_balance_org` (
	`organization_id` text PRIMARY KEY NOT NULL,
	`balance` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `org_invite_link` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`token` text NOT NULL,
	`role` text NOT NULL,
	`max_uses` integer,
	`uses` integer DEFAULT 0 NOT NULL,
	`expires_at` integer,
	`revoked_at` integer,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `org_invite_link_token_unique` ON `org_invite_link` (`token`);--> statement-breakpoint
CREATE INDEX `org_invite_link_org_idx` ON `org_invite_link` (`organization_id`);--> statement-breakpoint
CREATE TABLE `org_limits` (
	`organization_id` text PRIMARY KEY NOT NULL,
	`monthly_credit_cap` integer,
	`per_member_daily_cap` integer,
	`generations_per_minute` integer DEFAULT 40 NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `asset` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`project_id` text,
	`url` text NOT NULL,
	`kind` text NOT NULL,
	`generation_id` text,
	`name` text,
	`review_state` text DEFAULT 'draft' NOT NULL,
	`review_note` text,
	`reviewed_by` text,
	`reviewed_at` integer,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `project`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`generation_id`) REFERENCES `generation`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`reviewed_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `asset_org_created_idx` ON `asset` (`organization_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `asset_project_review_idx` ON `asset` (`project_id`,`review_state`);--> statement-breakpoint
CREATE UNIQUE INDEX `asset_org_url_unique` ON `asset` (`organization_id`,`url`);--> statement-breakpoint
CREATE TABLE `batch_item` (
	`id` text PRIMARY KEY NOT NULL,
	`batch_job_id` text NOT NULL,
	`idx` integer NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`generation_id` text,
	`output_url` text,
	`error_code` text,
	`created_at` integer NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`batch_job_id`) REFERENCES `batch_job`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`generation_id`) REFERENCES `generation`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `batch_item_job_idx_idx` ON `batch_item` (`batch_job_id`,`idx`);--> statement-breakpoint
CREATE TABLE `batch_job` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`project_id` text,
	`created_by` text NOT NULL,
	`skill_id` text NOT NULL,
	`style_id` text,
	`description` text,
	`source_asset_url` text,
	`ref_asset_url` text,
	`variant_count` integer NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`credits_reserved` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `project`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `batch_job_org_created_idx` ON `batch_job` (`organization_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `project` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`name` text NOT NULL,
	`brief` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `project_org_updated_idx` ON `project` (`organization_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `share_link` (
	`id` text PRIMARY KEY NOT NULL,
	`token` text NOT NULL,
	`organization_id` text NOT NULL,
	`project_id` text,
	`asset_id` text,
	`scope` text NOT NULL,
	`allow_comments` integer DEFAULT false NOT NULL,
	`expires_at` integer,
	`revoked_at` integer,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `project`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`asset_id`) REFERENCES `asset`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `share_link_token_unique` ON `share_link` (`token`);--> statement-breakpoint
CREATE INDEX `share_link_org_created_idx` ON `share_link` (`organization_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `session` ADD `active_organization_id` text;--> statement-breakpoint
ALTER TABLE `credit_ledger` ADD `organization_id` text REFERENCES organization(id);--> statement-breakpoint
CREATE INDEX `ledger_org_created_idx` ON `credit_ledger` (`organization_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `ledger_org_actor_created_idx` ON `credit_ledger` (`organization_id`,`user_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `character` ADD `organization_id` text REFERENCES organization(id);--> statement-breakpoint
CREATE INDEX `character_org_created_idx` ON `character` (`organization_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `feedback` ADD `organization_id` text REFERENCES organization(id);--> statement-breakpoint
ALTER TABLE `generation` ADD `organization_id` text REFERENCES organization(id);--> statement-breakpoint
ALTER TABLE `generation` ADD `project_id` text REFERENCES project(id);--> statement-breakpoint
CREATE INDEX `generation_org_created_idx` ON `generation` (`organization_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `generation_project_created_idx` ON `generation` (`project_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `moodboard_item` ADD `organization_id` text REFERENCES organization(id);--> statement-breakpoint
CREATE INDEX `moodboard_org_created_idx` ON `moodboard_item` (`organization_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `thread` ADD `organization_id` text REFERENCES organization(id);--> statement-breakpoint
ALTER TABLE `thread` ADD `project_id` text REFERENCES project(id);--> statement-breakpoint
CREATE INDEX `thread_org_updated_idx` ON `thread` (`organization_id`,`updated_at`);