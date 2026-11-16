CREATE TABLE `platform_bootstrap_claims` (
	`id` text PRIMARY KEY NOT NULL,
	`claimed_by_user_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`claimed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
