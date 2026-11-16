CREATE TABLE `milestones` (
	`id` text PRIMARY KEY NOT NULL,
	`shipment_id` text NOT NULL,
	`status` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `organizations` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	`rating` real,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `quote_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`shipper_id` text NOT NULL,
	`origin` text NOT NULL,
	`destination` text NOT NULL,
	`load_type` text NOT NULL,
	`units` integer NOT NULL,
	`weight_kg` real NOT NULL,
	`volume_cbm` real NOT NULL,
	`status` text DEFAULT 'QUOTED' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `quotes` (
	`id` text PRIMARY KEY NOT NULL,
	`request_id` text NOT NULL,
	`rate_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`price` real NOT NULL,
	`currency` text NOT NULL,
	`transit_days` integer NOT NULL,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `rates` (
	`id` text PRIMARY KEY NOT NULL,
	`provider_id` text NOT NULL,
	`origin` text NOT NULL,
	`destination` text NOT NULL,
	`mode` text NOT NULL,
	`base_price` real NOT NULL,
	`currency` text DEFAULT 'USD' NOT NULL,
	`transit_days` integer NOT NULL,
	`valid_until` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `shipments` (
	`id` text PRIMARY KEY NOT NULL,
	`reference` text NOT NULL,
	`quote_id` text NOT NULL,
	`shipper_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`origin` text NOT NULL,
	`destination` text NOT NULL,
	`status` text DEFAULT 'BOOKING_VERIFICATION' NOT NULL,
	`price` real NOT NULL,
	`currency` text NOT NULL,
	`eta` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `shipments_reference_unique` ON `shipments` (`reference`);