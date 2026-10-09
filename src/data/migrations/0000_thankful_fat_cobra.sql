CREATE TABLE `coach_chats` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`messages` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `coach_chats_recent` ON `coach_chats` (`updated_at`);--> statement-breakpoint
CREATE TABLE `coach_settings` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`consent_at` integer,
	`provider` text,
	`model` text,
	`key_last4` text,
	`custom_instructions` text,
	`brief_minute` integer,
	`last_brief_day` text,
	`updated_at` integer NOT NULL,
	CONSTRAINT "coach_settings_single_row" CHECK("coach_settings"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE `daily_metrics` (
	`day` text PRIMARY KEY NOT NULL,
	`hrv_ms` real,
	`hrv_deep_ms` real,
	`rhr_bpm` real,
	`rhr_method` text,
	`resp_bpm` real,
	`nightly_temp_c` real,
	`spo2_pct` real,
	`vo2max_daily` real,
	`vo2max_run` real,
	`steps` integer,
	`calories` real,
	`weight_kg` real,
	`body_fat_pct` real,
	`hr_zones` text,
	`light_moderate_min` real,
	`vigorous_peak_min` real,
	`temp_baseline_c` real,
	`temp_sd_c` real,
	`rhr_range_low` real,
	`rhr_range_high` real,
	`hrv_range_low` real,
	`hrv_range_high` real,
	`source` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `daily_scores` (
	`day` text PRIMARY KEY NOT NULL,
	`scoring_version` integer NOT NULL,
	`strain` text,
	`activities` text,
	`session_rhr_bpm` real,
	`recovery` text,
	`sleep` text,
	`training_load` text,
	`strain_target` text,
	`sleep_planner` text,
	`energy_bank` text,
	`stress` text,
	`health_monitor` text,
	`healthspan` text,
	`fitness` text,
	`journal_impact` text
);
--> statement-breakpoint
CREATE TABLE `daily_values` (
	`day` text NOT NULL,
	`key` text NOT NULL,
	`value` real NOT NULL,
	PRIMARY KEY(`day`, `key`)
);
--> statement-breakpoint
CREATE INDEX `daily_values_key` ON `daily_values` (`key`,`day`);--> statement-breakpoint
CREATE TABLE `dashboard_metrics` (
	`key` text PRIMARY KEY NOT NULL,
	`position` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `exercises` (
	`id` text PRIMARY KEY NOT NULL,
	`day` text NOT NULL,
	`start_ts` integer NOT NULL,
	`end_ts` integer NOT NULL,
	`type` text NOT NULL,
	`name` text,
	`calories` real,
	`distance_m` real,
	`source` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `exercises_day` ON `exercises` (`day`);--> statement-breakpoint
CREATE TABLE `fold_checkpoints` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`day` text NOT NULL,
	`scoring_version` integer NOT NULL,
	`inputs_key` text NOT NULL,
	`fold` text NOT NULL,
	CONSTRAINT "fold_checkpoints_single_row" CHECK("fold_checkpoints"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE `health_records` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`ts` integer NOT NULL,
	`day` text NOT NULL,
	`data` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `health_records_ts` ON `health_records` (`ts`);--> statement-breakpoint
CREATE TABLE `hr_days` (
	`bucket` integer PRIMARY KEY NOT NULL,
	`offsets` blob NOT NULL,
	`values` blob NOT NULL,
	`minute` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE `intraday_dirty` (
	`day` text PRIMARY KEY NOT NULL
);
--> statement-breakpoint
CREATE TABLE `intraday_series` (
	`day` text NOT NULL,
	`kind` text NOT NULL,
	`data` text NOT NULL,
	PRIMARY KEY(`day`, `kind`)
);
--> statement-breakpoint
CREATE TABLE `journal_entries` (
	`day` text NOT NULL,
	`tag` text NOT NULL,
	`value` integer NOT NULL,
	`detail` integer,
	PRIMARY KEY(`day`, `tag`)
);
--> statement-breakpoint
CREATE TABLE `journal_notes` (
	`day` text PRIMARY KEY NOT NULL,
	`text` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `journal_tags` (
	`tag` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`hidden` integer DEFAULT false NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`seq` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `logged_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`ts` integer NOT NULL,
	`day` text NOT NULL,
	`data` text NOT NULL,
	`google_name` text,
	`source` text DEFAULT 'pulse' NOT NULL,
	`app` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `logged_entries_ts` ON `logged_entries` (`ts`);--> statement-breakpoint
CREATE INDEX `logged_entries_day_type` ON `logged_entries` (`day`,`type`);--> statement-breakpoint
CREATE TABLE `profile` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`birth_date` text NOT NULL,
	`sex` text NOT NULL,
	`max_hr` integer,
	`height_cm` real,
	`time_zone` text NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "profile_single_row" CHECK("profile"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE `raw_payloads` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text NOT NULL,
	`range_start` integer NOT NULL,
	`range_end` integer NOT NULL,
	`body_hash` text NOT NULL,
	`gz_body` blob NOT NULL,
	`fetched_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `raw_payloads_fetched_at` ON `raw_payloads` (`fetched_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `raw_payloads_dedupe` ON `raw_payloads` (`type`,`range_start`,`range_end`,`body_hash`);--> statement-breakpoint
CREATE TABLE `reports` (
	`period` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sleep_segments` (
	`session_id` text NOT NULL,
	`start_ts` integer NOT NULL,
	`end_ts` integer NOT NULL,
	`stage` text NOT NULL,
	PRIMARY KEY(`session_id`, `start_ts`),
	FOREIGN KEY (`session_id`) REFERENCES `sleep_sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `sleep_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`day` text NOT NULL,
	`start_ts` integer NOT NULL,
	`end_ts` integer NOT NULL,
	`is_main` integer NOT NULL,
	`processed` integer NOT NULL,
	`stages_status` text,
	`asleep_min` integer,
	`awake_min` integer,
	`deep_min` integer,
	`light_min` integer,
	`rem_min` integer,
	`source` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `sleep_sessions_day` ON `sleep_sessions` (`day`);--> statement-breakpoint
CREATE TABLE `steps_days` (
	`bucket` integer PRIMARY KEY NOT NULL,
	`offsets` blob NOT NULL,
	`values` blob NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sync_state` (
	`type` text PRIMARY KEY NOT NULL,
	`synced_through` integer,
	`backfill_days_done` integer,
	`backfill_days_total` integer,
	`last_attempt_at` integer,
	`last_success_at` integer,
	`last_error` text
);
