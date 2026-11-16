ALTER TABLE `quote_requests` ADD `ready_date` text NOT NULL DEFAULT '1970-01-01T00:00:00.000Z';
--> statement-breakpoint
UPDATE `quote_requests` SET `ready_date` = `created_at` WHERE `ready_date` = '1970-01-01T00:00:00.000Z';
