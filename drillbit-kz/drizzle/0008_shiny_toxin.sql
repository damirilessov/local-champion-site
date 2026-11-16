CREATE TABLE `shipment_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`shipment_id` text NOT NULL,
	`uploaded_by_user_id` text NOT NULL,
	`uploaded_by_organization_id` text NOT NULL,
	`kind` text NOT NULL,
	`file_name` text NOT NULL,
	`object_key` text NOT NULL,
	`content_type` text NOT NULL,
	`size` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`shipment_id`) REFERENCES `shipments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`uploaded_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`uploaded_by_organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `shipment_documents_object_key_unique` ON `shipment_documents` (`object_key`);--> statement-breakpoint
CREATE INDEX `idx_shipment_documents_shipment` ON `shipment_documents` (`shipment_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `organizations` ADD `country` text;--> statement-breakpoint
ALTER TABLE `organizations` ADD `business_id` text;--> statement-breakpoint
ALTER TABLE `organizations` ADD `contact_name` text;--> statement-breakpoint
ALTER TABLE `organizations` ADD `contact_phone` text;--> statement-breakpoint
ALTER TABLE `organizations` ADD `service_region` text;--> statement-breakpoint
ALTER TABLE `quote_requests` ADD `pickup_address` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `quote_requests` ADD `delivery_address` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `quote_requests` ADD `contact_name` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `quote_requests` ADD `contact_phone` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `quote_requests` ADD `cargo_description` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `quote_requests` ADD `incoterm` text DEFAULT 'EXW' NOT NULL;--> statement-breakpoint
ALTER TABLE `quote_requests` ADD `special_requirements` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `shipments` ADD `pod_document_id` text;--> statement-breakpoint
ALTER TABLE `shipments` ADD `invoice_number` text;--> statement-breakpoint
ALTER TABLE `shipments` ADD `payment_status` text DEFAULT 'PENDING' NOT NULL;