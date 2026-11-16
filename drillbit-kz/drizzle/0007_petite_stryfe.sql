ALTER TABLE `organizations` ADD `is_demo` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `quote_requests` ADD `cargo_items_json` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
INSERT OR IGNORE INTO `users` (`id`, `email`, `display_name`, `status`)
VALUES ('user-demo-system', 'system@atlas.demo', 'Atlas Demo', 'ACTIVE');--> statement-breakpoint
INSERT OR IGNORE INTO `organizations` (`id`, `name`, `kind`, `profile_type`, `is_demo`, `status`, `rating`)
VALUES ('org-demo-express', 'Atlas Demo Express', 'PROVIDER', 'BUSINESS', 1, 'ACTIVE', 4.9);--> statement-breakpoint
INSERT OR IGNORE INTO `organizations` (`id`, `name`, `kind`, `profile_type`, `is_demo`, `status`, `rating`)
VALUES ('org-demo-silk', 'Silk Route Demo', 'PROVIDER', 'BUSINESS', 1, 'ACTIVE', 4.7);--> statement-breakpoint
INSERT OR IGNORE INTO `organizations` (`id`, `name`, `kind`, `profile_type`, `is_demo`, `status`, `rating`)
VALUES ('org-demo-global', 'Global Cargo Demo', 'PROVIDER', 'BUSINESS', 1, 'ACTIVE', 4.6);
