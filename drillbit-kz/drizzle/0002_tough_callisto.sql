DROP INDEX `idx_invitation_org_email_pending`;--> statement-breakpoint
CREATE INDEX `idx_invitation_org_email_status` ON `organization_invitations` (`organization_id`,`email`,`status`);