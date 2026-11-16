import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const organizations = sqliteTable("organizations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  kind: text("kind", { enum: ["SHIPPER", "PROVIDER", "PLATFORM"] }).notNull(),
  profileType: text("profile_type", { enum: ["BUSINESS", "PERSONAL"] }).notNull().default("BUSINESS"),
  isDemo: integer("is_demo", { mode: "boolean" }).notNull().default(false),
  status: text("status", { enum: ["ACTIVE", "SUSPENDED"] }).notNull().default("ACTIVE"),
  rating: real("rating"),
  country: text("country"),
  businessId: text("business_id"),
  contactName: text("contact_name"),
  contactPhone: text("contact_phone"),
  serviceRegion: text("service_region"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  displayName: text("display_name").notNull(),
  status: text("status", { enum: ["ACTIVE", "SUSPENDED"] }).notNull().default("ACTIVE"),
  lastSeenAt: text("last_seen_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [uniqueIndex("idx_users_email").on(table.email)]);

export const organizationMemberships = sqliteTable("organization_memberships", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id),
  userId: text("user_id").notNull().references(() => users.id),
  role: text("role", { enum: ["OWNER", "ADMIN", "OPERATIONS", "FINANCE", "VIEWER"] }).notNull(),
  status: text("status", { enum: ["ACTIVE", "SUSPENDED"] }).notNull().default("ACTIVE"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("idx_membership_org_user").on(table.organizationId, table.userId),
  index("idx_membership_user_status").on(table.userId, table.status),
]);

export const organizationInvitations = sqliteTable("organization_invitations", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id),
  email: text("email").notNull(),
  role: text("role", { enum: ["ADMIN", "OPERATIONS", "FINANCE", "VIEWER"] }).notNull(),
  invitedByUserId: text("invited_by_user_id").notNull().references(() => users.id),
  status: text("status", { enum: ["PENDING", "ACCEPTED", "DECLINED", "REVOKED", "EXPIRED"] }).notNull().default("PENDING"),
  expiresAt: text("expires_at").notNull(),
  acceptedAt: text("accepted_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("idx_invitation_org_email_status").on(table.organizationId, table.email, table.status),
  index("idx_invitation_email_status").on(table.email, table.status),
]);

export const platformBootstrapClaims = sqliteTable("platform_bootstrap_claims", {
  id: text("id").primaryKey(),
  claimedByUserId: text("claimed_by_user_id").notNull().references(() => users.id),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const rates = sqliteTable("rates", {
  id: text("id").primaryKey(),
  providerId: text("provider_id").notNull().references(() => organizations.id),
  origin: text("origin").notNull(),
  destination: text("destination").notNull(),
  mode: text("mode").notNull(),
  version: integer("version").notNull().default(1),
  basePrice: real("base_price").notNull(),
  perKg: real("per_kg").notNull().default(0),
  perCbm: real("per_cbm").notNull().default(0),
  fuelPercent: real("fuel_percent").notNull().default(0),
  handlingFee: real("handling_fee").notNull().default(0),
  minimumCharge: real("minimum_charge").notNull().default(0),
  currency: text("currency").notNull().default("USD"),
  transitDays: integer("transit_days").notNull(),
  effectiveFrom: text("effective_from").notNull(),
  validUntil: text("valid_until").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdByUserId: text("created_by_user_id").notNull().references(() => users.id),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("idx_rate_provider_lane_version").on(table.providerId, table.origin, table.destination, table.mode, table.version),
  index("idx_rates_lane_active_validity").on(table.origin, table.destination, table.active, table.effectiveFrom, table.validUntil),
]);

export const quoteRequests = sqliteTable("quote_requests", {
  id: text("id").primaryKey(),
  shipperId: text("shipper_id").notNull().references(() => organizations.id),
  createdByUserId: text("created_by_user_id").notNull().references(() => users.id),
  origin: text("origin").notNull(),
  destination: text("destination").notNull(),
  loadType: text("load_type").notNull(),
  mode: text("mode").notNull(),
  units: integer("units").notNull(),
  weightKg: real("weight_kg").notNull(),
  volumeCbm: real("volume_cbm").notNull(),
  cargoItemsJson: text("cargo_items_json").notNull().default("[]"),
  pickupAddress: text("pickup_address").notNull().default(""),
  deliveryAddress: text("delivery_address").notNull().default(""),
  contactName: text("contact_name").notNull().default(""),
  contactPhone: text("contact_phone").notNull().default(""),
  cargoDescription: text("cargo_description").notNull().default(""),
  incoterm: text("incoterm").notNull().default("EXW"),
  specialRequirements: text("special_requirements").notNull().default(""),
  readyDate: text("ready_date").notNull(),
  status: text("status", { enum: ["OPEN", "QUOTED", "BOOKED", "EXPIRED", "CANCELLED"] }).notNull().default("OPEN"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("idx_quote_requests_shipper_created").on(table.shipperId, table.createdAt)]);

export const quotes = sqliteTable("quotes", {
  id: text("id").primaryKey(),
  requestId: text("request_id").notNull().references(() => quoteRequests.id),
  rateId: text("rate_id").notNull().references(() => rates.id),
  rateVersion: integer("rate_version").notNull(),
  providerId: text("provider_id").notNull().references(() => organizations.id),
  baseAmount: real("base_amount").notNull(),
  weightAmount: real("weight_amount").notNull(),
  volumeAmount: real("volume_amount").notNull(),
  fuelAmount: real("fuel_amount").notNull(),
  handlingAmount: real("handling_amount").notNull(),
  price: real("price").notNull(),
  currency: text("currency").notNull(),
  transitDays: integer("transit_days").notNull(),
  pricingSnapshot: text("pricing_snapshot").notNull(),
  status: text("status", { enum: ["ACTIVE", "BOOKED", "EXPIRED", "CANCELLED"] }).notNull().default("ACTIVE"),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("idx_quotes_request_status").on(table.requestId, table.status),
  index("idx_quotes_provider_status").on(table.providerId, table.status),
]);

export const shipments = sqliteTable("shipments", {
  id: text("id").primaryKey(),
  reference: text("reference").notNull().unique(),
  quoteId: text("quote_id").notNull().references(() => quotes.id).unique(),
  shipperId: text("shipper_id").notNull().references(() => organizations.id),
  providerId: text("provider_id").notNull().references(() => organizations.id),
  origin: text("origin").notNull(),
  destination: text("destination").notNull(),
  status: text("status").notNull().default("BOOKING_VERIFICATION"),
  price: real("price").notNull(),
  currency: text("currency").notNull(),
  eta: text("eta").notNull(),
  pickupAt: text("pickup_at"),
  vehicle: text("vehicle"),
  driver: text("driver"),
  actualPickupAt: text("actual_pickup_at"),
  deliveredAt: text("delivered_at"),
  podReference: text("pod_reference"),
  podDocumentId: text("pod_document_id"),
  invoiceNumber: text("invoice_number"),
  paymentStatus: text("payment_status", { enum: ["PENDING", "INVOICED", "PAID"] }).notNull().default("PENDING"),
  version: integer("version").notNull().default(1),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("idx_shipments_shipper_status").on(table.shipperId, table.status),
  index("idx_shipments_provider_status").on(table.providerId, table.status),
]);

export const milestones = sqliteTable("milestones", {
  id: text("id").primaryKey(),
  shipmentId: text("shipment_id").notNull().references(() => shipments.id),
  status: text("status").notNull(),
  note: text("note").notNull().default(""),
  actorUserId: text("actor_user_id").notNull().references(() => users.id),
  actorOrganizationId: text("actor_organization_id").notNull().references(() => organizations.id),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("idx_milestones_shipment_created").on(table.shipmentId, table.createdAt)]);

export const shipmentDocuments = sqliteTable("shipment_documents", {
  id: text("id").primaryKey(),
  shipmentId: text("shipment_id").notNull().references(() => shipments.id),
  uploadedByUserId: text("uploaded_by_user_id").notNull().references(() => users.id),
  uploadedByOrganizationId: text("uploaded_by_organization_id").notNull().references(() => organizations.id),
  kind: text("kind", { enum: ["POD", "INVOICE", "CARGO"] }).notNull(),
  fileName: text("file_name").notNull(),
  objectKey: text("object_key").notNull().unique(),
  contentType: text("content_type").notNull(),
  size: integer("size").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("idx_shipment_documents_shipment").on(table.shipmentId, table.createdAt)]);

export const auditEvents = sqliteTable("audit_events", {
  id: text("id").primaryKey(),
  actorUserId: text("actor_user_id").notNull().references(() => users.id),
  actorOrganizationId: text("actor_organization_id"),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  beforeJson: text("before_json"),
  afterJson: text("after_json"),
  requestId: text("request_id").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("idx_audit_org_created").on(table.actorOrganizationId, table.createdAt),
  index("idx_audit_entity").on(table.entityType, table.entityId),
]);
