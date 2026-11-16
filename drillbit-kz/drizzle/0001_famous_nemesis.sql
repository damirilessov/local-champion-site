CREATE TABLE `users` (
  `id` text PRIMARY KEY NOT NULL,
  `email` text NOT NULL,
  `display_name` text NOT NULL,
  `status` text DEFAULT 'ACTIVE' NOT NULL,
  `last_seen_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_users_email` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `organization_memberships` (
  `id` text PRIMARY KEY NOT NULL,
  `organization_id` text NOT NULL,
  `user_id` text NOT NULL,
  `role` text NOT NULL,
  `status` text DEFAULT 'ACTIVE' NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`),
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`)
);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_membership_org_user` ON `organization_memberships` (`organization_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `idx_membership_user_status` ON `organization_memberships` (`user_id`,`status`);--> statement-breakpoint
CREATE TABLE `organization_invitations` (
  `id` text PRIMARY KEY NOT NULL,
  `organization_id` text NOT NULL,
  `email` text NOT NULL,
  `role` text NOT NULL,
  `invited_by_user_id` text NOT NULL,
  `status` text DEFAULT 'PENDING' NOT NULL,
  `expires_at` text NOT NULL,
  `accepted_at` text,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`),
  FOREIGN KEY (`invited_by_user_id`) REFERENCES `users`(`id`)
);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_invitation_org_email_pending` ON `organization_invitations` (`organization_id`,`email`,`status`);--> statement-breakpoint
CREATE INDEX `idx_invitation_email_status` ON `organization_invitations` (`email`,`status`);--> statement-breakpoint
CREATE TABLE `audit_events` (
  `id` text PRIMARY KEY NOT NULL,
  `actor_user_id` text NOT NULL,
  `actor_organization_id` text,
  `action` text NOT NULL,
  `entity_type` text NOT NULL,
  `entity_id` text NOT NULL,
  `before_json` text,
  `after_json` text,
  `request_id` text NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`)
);--> statement-breakpoint
CREATE INDEX `idx_audit_org_created` ON `audit_events` (`actor_organization_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_audit_entity` ON `audit_events` (`entity_type`,`entity_id`);--> statement-breakpoint
INSERT OR IGNORE INTO `users` (`id`, `email`, `display_name`, `status`) VALUES ('migration-system', 'system@atlas.invalid', 'Миграция Atlas Freight', 'ACTIVE');--> statement-breakpoint
INSERT OR IGNORE INTO `organizations` (`id`, `name`, `kind`, `status`) VALUES ('platform-atlas', 'Atlas Freight', 'PLATFORM', 'ACTIVE');--> statement-breakpoint

ALTER TABLE `quote_requests` RENAME TO `legacy_quote_requests`;--> statement-breakpoint
ALTER TABLE `rates` RENAME TO `legacy_rates`;--> statement-breakpoint
ALTER TABLE `quotes` RENAME TO `legacy_quotes`;--> statement-breakpoint
ALTER TABLE `shipments` RENAME TO `legacy_shipments`;--> statement-breakpoint
ALTER TABLE `milestones` RENAME TO `legacy_milestones`;--> statement-breakpoint

CREATE TABLE `quote_requests` (
  `id` text PRIMARY KEY NOT NULL,
  `shipper_id` text NOT NULL,
  `created_by_user_id` text NOT NULL,
  `origin` text NOT NULL,
  `destination` text NOT NULL,
  `load_type` text NOT NULL,
  `mode` text NOT NULL,
  `units` integer NOT NULL,
  `weight_kg` real NOT NULL,
  `volume_cbm` real NOT NULL,
  `status` text DEFAULT 'OPEN' NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`shipper_id`) REFERENCES `organizations`(`id`),
  FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`)
);--> statement-breakpoint
CREATE TABLE `rates` (
  `id` text PRIMARY KEY NOT NULL,
  `provider_id` text NOT NULL,
  `origin` text NOT NULL,
  `destination` text NOT NULL,
  `mode` text NOT NULL,
  `version` integer DEFAULT 1 NOT NULL,
  `base_price` real NOT NULL,
  `per_kg` real DEFAULT 0 NOT NULL,
  `per_cbm` real DEFAULT 0 NOT NULL,
  `fuel_percent` real DEFAULT 0 NOT NULL,
  `handling_fee` real DEFAULT 0 NOT NULL,
  `minimum_charge` real DEFAULT 0 NOT NULL,
  `currency` text DEFAULT 'USD' NOT NULL,
  `transit_days` integer NOT NULL,
  `effective_from` text NOT NULL,
  `valid_until` text NOT NULL,
  `active` integer DEFAULT true NOT NULL,
  `created_by_user_id` text NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`provider_id`) REFERENCES `organizations`(`id`),
  FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`)
);--> statement-breakpoint
CREATE TABLE `quotes` (
  `id` text PRIMARY KEY NOT NULL,
  `request_id` text NOT NULL,
  `rate_id` text NOT NULL,
  `rate_version` integer NOT NULL,
  `provider_id` text NOT NULL,
  `base_amount` real NOT NULL,
  `weight_amount` real NOT NULL,
  `volume_amount` real NOT NULL,
  `fuel_amount` real NOT NULL,
  `handling_amount` real NOT NULL,
  `price` real NOT NULL,
  `currency` text NOT NULL,
  `transit_days` integer NOT NULL,
  `pricing_snapshot` text NOT NULL,
  `status` text DEFAULT 'ACTIVE' NOT NULL,
  `expires_at` text NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`request_id`) REFERENCES `quote_requests`(`id`),
  FOREIGN KEY (`rate_id`) REFERENCES `rates`(`id`),
  FOREIGN KEY (`provider_id`) REFERENCES `organizations`(`id`)
);--> statement-breakpoint
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
  `version` integer DEFAULT 1 NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`quote_id`) REFERENCES `quotes`(`id`),
  FOREIGN KEY (`shipper_id`) REFERENCES `organizations`(`id`),
  FOREIGN KEY (`provider_id`) REFERENCES `organizations`(`id`)
);--> statement-breakpoint
CREATE TABLE `milestones` (
  `id` text PRIMARY KEY NOT NULL,
  `shipment_id` text NOT NULL,
  `status` text NOT NULL,
  `note` text DEFAULT '' NOT NULL,
  `actor_user_id` text NOT NULL,
  `actor_organization_id` text NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`shipment_id`) REFERENCES `shipments`(`id`),
  FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`),
  FOREIGN KEY (`actor_organization_id`) REFERENCES `organizations`(`id`)
);--> statement-breakpoint

INSERT INTO `quote_requests` (`id`,`shipper_id`,`created_by_user_id`,`origin`,`destination`,`load_type`,`mode`,`units`,`weight_kg`,`volume_cbm`,`status`,`created_at`)
SELECT `id`,`shipper_id`,'migration-system',`origin`,`destination`,`load_type`,'Авто',`units`,`weight_kg`,`volume_cbm`,`status`,`created_at` FROM `legacy_quote_requests`;--> statement-breakpoint
INSERT INTO `rates` (`id`,`provider_id`,`origin`,`destination`,`mode`,`version`,`base_price`,`per_kg`,`per_cbm`,`fuel_percent`,`handling_fee`,`minimum_charge`,`currency`,`transit_days`,`effective_from`,`valid_until`,`active`,`created_by_user_id`,`created_at`)
SELECT `id`,`provider_id`,`origin`,`destination`,`mode`,1,`base_price`,0,0,0,0,`base_price`,`currency`,`transit_days`,`created_at`,`valid_until`,`active`,'migration-system',`created_at` FROM `legacy_rates`;--> statement-breakpoint
INSERT INTO `quotes` (`id`,`request_id`,`rate_id`,`rate_version`,`provider_id`,`base_amount`,`weight_amount`,`volume_amount`,`fuel_amount`,`handling_amount`,`price`,`currency`,`transit_days`,`pricing_snapshot`,`status`,`expires_at`,`created_at`)
SELECT `id`,`request_id`,`rate_id`,1,`provider_id`,`price`,0,0,0,0,`price`,`currency`,`transit_days`,json_object('legacy',1,'price',`price`,'currency',`currency`),`status`,`expires_at`,`created_at` FROM `legacy_quotes`;--> statement-breakpoint
INSERT INTO `shipments` (`id`,`reference`,`quote_id`,`shipper_id`,`provider_id`,`origin`,`destination`,`status`,`price`,`currency`,`eta`,`version`,`created_at`,`updated_at`)
SELECT `id`,`reference`,`quote_id`,`shipper_id`,`provider_id`,`origin`,`destination`,`status`,`price`,`currency`,`eta`,1,`created_at`,`updated_at` FROM `legacy_shipments`;--> statement-breakpoint
INSERT INTO `milestones` (`id`,`shipment_id`,`status`,`note`,`actor_user_id`,`actor_organization_id`,`created_at`)
SELECT `id`,`shipment_id`,`status`,`note`,'migration-system','platform-atlas',`created_at` FROM `legacy_milestones`;--> statement-breakpoint

DROP TABLE `legacy_milestones`;--> statement-breakpoint
DROP TABLE `legacy_shipments`;--> statement-breakpoint
DROP TABLE `legacy_quotes`;--> statement-breakpoint
DROP TABLE `legacy_rates`;--> statement-breakpoint
DROP TABLE `legacy_quote_requests`;--> statement-breakpoint

CREATE INDEX `idx_quote_requests_shipper_created` ON `quote_requests` (`shipper_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_rate_provider_lane_version` ON `rates` (`provider_id`,`origin`,`destination`,`mode`,`version`);--> statement-breakpoint
CREATE INDEX `idx_rates_lane_active_validity` ON `rates` (`origin`,`destination`,`active`,`effective_from`,`valid_until`);--> statement-breakpoint
CREATE INDEX `idx_quotes_request_status` ON `quotes` (`request_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_quotes_provider_status` ON `quotes` (`provider_id`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `shipments_reference_unique` ON `shipments` (`reference`);--> statement-breakpoint
CREATE UNIQUE INDEX `shipments_quote_id_unique` ON `shipments` (`quote_id`);--> statement-breakpoint
CREATE INDEX `idx_shipments_shipper_status` ON `shipments` (`shipper_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_shipments_provider_status` ON `shipments` (`provider_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_milestones_shipment_created` ON `milestones` (`shipment_id`,`created_at`);--> statement-breakpoint
PRAGMA foreign_key_check;
