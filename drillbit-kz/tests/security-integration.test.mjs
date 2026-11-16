import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { Miniflare } from "miniflare";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const migrations = [
  "0000_small_skreet.sql", "0001_famous_nemesis.sql",
  "0002_tough_callisto.sql", "0003_broken_lethal_legion.sql", "0004_whole_scarlet_witch.sql", "0005_silent_firelord.sql", "0006_jittery_star_brand.sql", "0007_petite_stryfe.sql", "0008_shiny_toxin.sql",
];

function identity(userId, email, organizationId) {
  return {
    "oai-authenticated-user-id": userId,
    "oai-authenticated-user-email": email,
    ...(organizationId ? { "x-organization-id": organizationId } : {}),
  };
}

async function createHarness() {
  const modulesRoot = fileURLToPath(new URL("../dist/server/", import.meta.url));
  const modulePaths = (await readdir(modulesRoot, { recursive: true }))
    .filter((path) => path.endsWith(".js"))
    .sort((left, right) => left === "index.js" ? -1 : right === "index.js" ? 1 : left.localeCompare(right));
  const mf = new Miniflare({
    modules: modulePaths.map((path) => ({ type: "ESModule", path: join(modulesRoot, path) })),
    modulesRoot,
    compatibilityDate: "2026-01-01",
    compatibilityFlags: ["nodejs_compat"],
    d1Databases: ["DB"],
    r2Buckets: ["FILES"],
    bindings: { ATLAS_BOOTSTRAP_TOKEN: "stage-one-bootstrap-token-123456" },
  });
  const db = await mf.getD1Database("DB");
  for (const migration of migrations) {
    const sql = await readFile(new URL(`../drizzle/${migration}`, import.meta.url), "utf8");
    for (const statement of sql.split("--> statement-breakpoint").map((part) => part.trim()).filter(Boolean)) {
      await db.prepare(statement).run();
    }
  }
  const api = async (path, { method = "GET", headers = {}, body } = {}) => {
    const response = await mf.dispatchFetch(`http://atlas.test${path}`, {
      method,
      headers: { ...(body ? { "content-type": "application/json" } : {}), ...headers },
      body: body ? JSON.stringify(body) : undefined,
    });
    const payload = await response.json();
    return { response, payload };
  };
  return { mf, db, api };
}

test("authenticated API enforces roles, tenants, expiry, idempotency, audit and organization selection", async () => {
  const { mf, db, api } = await createHarness();
  try {

  assert.equal((await api("/api/state")).response.status, 401);

  const users = {
    shipperA: identity("user-a", "a@example.kz"),
    shipperB: identity("user-b", "b@example.kz"),
    provider: identity("user-provider", "provider@example.kz"),
    providerB: identity("user-provider-b", "provider-b@example.kz"),
    viewer: identity("user-viewer", "viewer@example.kz"),
  };
  const createOrganization = async (headers, name, kind) => {
    await api("/api/session", { headers });
    const created = await api("/api/organizations", { method: "POST", headers, body: { name, kind, ...(kind === "PROVIDER" ? { country: "Казахстан", businessId: "123456789012", contactName: "Оператор", contactPhone: "+77010000000", serviceRegion: "Казахстан" } : {}) } });
    assert.equal(created.response.status, 201);
    return created.payload.organizationId;
  };
  const shipperAId = await createOrganization(users.shipperA, "Shipper A", "SHIPPER");
  const shipperBId = await createOrganization(users.shipperB, "Shipper B", "SHIPPER");
  const providerId = await createOrganization(users.provider, "Provider A", "PROVIDER");
  const providerBId = await createOrganization(users.providerB, "Provider B", "PROVIDER");
  users.shipperA = identity("user-a", "a@example.kz", shipperAId);
  users.shipperB = identity("user-b", "b@example.kz", shipperBId);
  users.provider = identity("user-provider", "provider@example.kz", providerId);
  users.providerB = identity("user-provider-b", "provider-b@example.kz", providerBId);

  const rateBody = {
    origin: "Алматы", destination: "Астана", mode: "Авто", basePrice: 1000,
    perKg: 1, perCbm: 10, fuelPercent: 5, handlingFee: 20, minimumCharge: 1000,
    currency: "USD", transitDays: 3, effectiveFrom: "2026-01-01", validUntil: "2030-01-01",
  };
  const shipmentDetails = { pickupAddress: "Склад 1, Алматы", deliveryAddress: "Склад 2, Астана", contactName: "Алия Клиент", contactPhone: "+77010000000", cargoDescription: "Запчасти", incoterm: "EXW", specialRequirements: "" };
  const rate = await api("/api/rates", { method: "POST", headers: users.provider, body: rateBody });
  assert.equal(rate.response.status, 201);

  const requestQuote = () => api("/api/quote-requests", {
    method: "POST", headers: users.shipperA,
    body: { origin: "Алматы", destination: "Астана", mode: "Авто", loadType: "Паллеты", units: 2, weight: 100, volume: 2, readyDate: "2027-01-01" },
  });
  const initialQuoteRequest = await requestQuote();
  assert.equal(initialQuoteRequest.response.status, 201);
  assert.ok(initialQuoteRequest.payload.quoteCount >= 4);
  const stateA = await api("/api/state", { headers: users.shipperA });
  assert.equal(stateA.payload.quoteRequests[0].origin, "Алматы, KZ");
  assert.equal(stateA.payload.quoteRequests[0].destination, "Астана, KZ");
  assert.equal(stateA.payload.quoteRequests[0].readyDate, "2027-01-01T00:00:00.000Z");
  assert.equal(stateA.payload.quoteRequests[0].pickupAddress, "", "operational address is collected after tariff selection");
  const quoteId = stateA.payload.quotes.find((quote) => quote.requestId === initialQuoteRequest.payload.requestId && quote.provider === "Provider A").id;
  assert.ok(quoteId);
  const stateB = await api("/api/state", { headers: users.shipperB });
  assert.equal(stateB.payload.quotes.length, 0);
  assert.equal((await api("/api/shipments", { method: "POST", headers: users.shipperB, body: { quoteId, details: shipmentDetails } })).response.status, 404);

  const bookingResults = await Promise.all([
    api("/api/shipments", { method: "POST", headers: users.shipperA, body: { quoteId, details: shipmentDetails } }),
    api("/api/shipments", { method: "POST", headers: users.shipperA, body: { quoteId, details: shipmentDetails } }),
  ]);
  assert.deepEqual(bookingResults.map((result) => result.response.status).sort(), [200, 201]);
  assert.equal(bookingResults[0].payload.shipmentId, bookingResults[1].payload.shipmentId);
  const booked = bookingResults[0];
  const bookedRow = await db.prepare("SELECT status, eta FROM shipments WHERE id = ?").bind(booked.payload.shipmentId).first();
  assert.equal(bookedRow.status, "SENT_TO_PROVIDER");
  assert.ok(new Date(bookedRow.eta) >= new Date("2027-01-04T00:00:00.000Z"));
  assert.equal(Number((await db.prepare("SELECT COUNT(*) AS count FROM shipments WHERE quote_id = ?").bind(quoteId).first()).count), 1);
  assert.equal((await db.prepare("SELECT pickup_address AS pickupAddress FROM quote_requests WHERE id = ?").bind(initialQuoteRequest.payload.requestId).first()).pickupAddress, shipmentDetails.pickupAddress);
  assert.equal((await api(`/api/shipments?id=${booked.payload.shipmentId}`, {
    method: "PATCH", headers: users.providerB, body: { status: "PROVIDER_ACCEPTED", expectedVersion: 1 },
  })).response.status, 404);
  assert.equal((await api(`/api/shipments?id=${booked.payload.shipmentId}`, {
    method: "PATCH", headers: users.provider, body: { status: "IN_TRANSIT", expectedVersion: 1 },
  })).response.status, 409);
  const statusResults = await Promise.all([
    api(`/api/shipments?id=${booked.payload.shipmentId}`, {
      method: "PATCH", headers: users.provider, body: { status: "PROVIDER_ACCEPTED", expectedVersion: 1, details: { invoiceNumber: "INV-001" } },
    }),
    api(`/api/shipments?id=${booked.payload.shipmentId}`, {
      method: "PATCH", headers: users.provider, body: { status: "PROVIDER_ACCEPTED", expectedVersion: 1, details: { invoiceNumber: "INV-001" } },
    }),
  ]);
  assert.deepEqual(statusResults.map((result) => result.response.status).sort(), [200, 409]);
  const statusMilestones = await db.prepare("SELECT COUNT(*) AS count FROM milestones WHERE shipment_id = ? AND status = 'PROVIDER_ACCEPTED'").bind(booked.payload.shipmentId).first();
  const statusAudits = await db.prepare("SELECT COUNT(*) AS count FROM audit_events WHERE entity_id = ? AND action = 'SHIPMENT_STATUS_CHANGED'").bind(booked.payload.shipmentId).first();
  assert.equal(Number(statusMilestones.count), 1);
  assert.equal(Number(statusAudits.count), 1);

  const expiringRequest = await requestQuote();
  const secondState = await api("/api/state", { headers: users.shipperA });
  const expiringQuoteId = secondState.payload.quotes.find((quote) => quote.requestId === expiringRequest.payload.requestId && quote.provider === "Provider A").id;
  await db.prepare("UPDATE quotes SET expires_at = '2000-01-01' WHERE id = ?").bind(expiringQuoteId).run();
  assert.equal((await api("/api/shipments", { method: "POST", headers: users.shipperA, body: { quoteId: expiringQuoteId, details: shipmentDetails } })).response.status, 404);
  assert.equal(Number((await db.prepare("SELECT COUNT(*) AS count FROM shipments WHERE quote_id = ?").bind(expiringQuoteId).first()).count), 0);

  const invite = await api("/api/invitations", {
    method: "POST", headers: users.provider, body: { email: "viewer@example.kz", role: "VIEWER" },
  });
  assert.equal(invite.response.status, 201);
  const viewerSession = await api("/api/session", { headers: users.viewer });
  assert.equal(viewerSession.response.status, 200);
  assert.equal(viewerSession.payload.membership, null);
  assert.equal(viewerSession.payload.pendingInvitations.length, 1);
  const invitationResponses = await Promise.all([
    api("/api/invitations/respond", { method: "POST", headers: users.viewer, body: { invitationId: invite.payload.invitationId, action: "ACCEPT" } }),
    api("/api/invitations/respond", { method: "POST", headers: users.viewer, body: { invitationId: invite.payload.invitationId, action: "ACCEPT" } }),
  ]);
  assert.deepEqual(invitationResponses.map((result) => result.response.status).sort(), [201, 409]);
  assert.equal(Number((await db.prepare("SELECT COUNT(*) AS count FROM audit_events WHERE entity_id = ? AND action = 'INVITATION_ACCEPTED'").bind(invite.payload.invitationId).first()).count), 1);
  const viewerHeaders = identity("user-viewer", "viewer@example.kz", providerId);
  assert.equal((await api("/api/rates", { method: "POST", headers: viewerHeaders, body: rateBody })).response.status, 403);

  const multiOrgInvite = await api("/api/invitations", {
    method: "POST", headers: users.provider, body: { email: "a@example.kz", role: "VIEWER" },
  });
  await api("/api/invitations/respond", { method: "POST", headers: users.shipperA, body: { invitationId: multiOrgInvite.payload.invitationId, action: "ACCEPT" } });
  const providerSelection = await api("/api/session", { headers: identity("user-a", "a@example.kz", providerId) });
  assert.equal(providerSelection.payload.membership.organizationId, providerId);
  assert.equal(providerSelection.payload.memberships.length, 2);
  const personalOverview = await api("/api/me/overview", { headers: identity("user-a", "a@example.kz", providerId) });
  assert.equal(personalOverview.response.status, 200);
  assert.deepEqual(personalOverview.payload.organizations.map((item) => item.id).sort(), [providerId, shipperAId].sort());
  const personalClient = await api("/api/organizations", { method: "POST", headers: users.shipperA, body: { name: "Личный кабинет A", kind: "SHIPPER", profileType: "PERSONAL" } });
  assert.equal(personalClient.response.status, 201);
  const personalSession = await api("/api/session", { headers: identity("user-a", "a@example.kz", personalClient.payload.organizationId) });
  assert.equal(personalSession.payload.membership.organizationProfileType, "PERSONAL");

  const scheduled = await api("/api/rates", {
    method: "POST", headers: users.provider,
    body: { ...rateBody, basePrice: 500, effectiveFrom: "2029-01-01", validUntil: "2031-01-01" },
  });
  assert.equal(scheduled.response.status, 201);
  const quotedWithSchedule = await requestQuote();
  assert.ok(quotedWithSchedule.payload.quoteCount >= 4, "future rate must not disable the current rate or demo alternatives");

  const serviceDateRate = await api("/api/rates", {
    method: "POST", headers: users.provider,
    body: { ...rateBody, basePrice: 650, effectiveFrom: "2026-12-01", validUntil: "2031-01-01" },
  });
  assert.equal(serviceDateRate.response.status, 201);
  const serviceDateQuote = await requestQuote();
  const serviceDateState = await api("/api/state", { headers: users.shipperA });
  const selectedServiceQuote = serviceDateState.payload.quotes.find((quote) => quote.requestId === serviceDateQuote.payload.requestId && quote.provider === "Provider A");
  assert.equal(JSON.parse(selectedServiceQuote.pricingSnapshot).rateVersion, serviceDateRate.payload.version, "ready date must select the version effective for service");

  const dimensionalSearch = await api("/api/quote-requests", {
    method: "POST", headers: users.shipperA,
    body: {
      origin: "Лондон, GB", destination: "Париж, FR", mode: "Любой", loadType: "Коробки", readyDate: "2027-02-01",
      cargoItems: [{ quantity: 2, lengthCm: 120, widthCm: 80, heightCm: 90, weightKg: 250 }],
      pickupAddress: "Warehouse 1, London", deliveryAddress: "Warehouse 2, Paris", contactName: "Alex Client", contactPhone: "+441234567890", cargoDescription: "Parts", incoterm: "DAP",
    },
  });
  assert.equal(dimensionalSearch.response.status, 201);
  assert.equal(dimensionalSearch.payload.quoteCount, 6);
  const dimensionalState = await api("/api/state", { headers: users.shipperA });
  const dimensionalRequest = dimensionalState.payload.quoteRequests.find((item) => item.id === dimensionalSearch.payload.requestId);
  const dimensionalQuotes = dimensionalState.payload.quotes.filter((item) => item.requestId === dimensionalSearch.payload.requestId);
  assert.equal(dimensionalRequest.units, 2);
  assert.equal(dimensionalRequest.weightKg, 500);
  assert.equal(dimensionalRequest.volumeCbm, 1.728);
  assert.equal(dimensionalRequest.cargoItems.length, 1);
  assert.deepEqual([...new Set(dimensionalQuotes.map((item) => item.mode))].sort(), ["Авиа", "Авто", "Ж/д", "Море"].sort());
  assert.equal((await api("/api/shipments", { method: "POST", headers: users.shipperA, body: { quoteId: dimensionalQuotes[0].id, details: shipmentDetails } })).response.status, 404, "estimated offers must never create operational shipments");

  const flowRequest = await requestQuote();
  const flowState = await api("/api/state", { headers: users.shipperA });
  const flowQuote = flowState.payload.quotes.find((quote) => quote.requestId === flowRequest.payload.requestId && quote.provider === "Provider A");
  const flowBooking = await api("/api/shipments", { method: "POST", headers: users.shipperA, body: { quoteId: flowQuote.id, details: shipmentDetails } });
  assert.equal(flowBooking.response.status, 201);
  const flowId = flowBooking.payload.shipmentId;
  assert.equal((await api(`/api/shipments?id=${flowId}`, { method: "PATCH", headers: users.provider, body: { status: "PROVIDER_ACCEPTED", expectedVersion: 1, details: { invoiceNumber: "INV-FLOW-1" } } })).response.status, 200);
  assert.equal((await api(`/api/shipments?id=${flowId}`, { method: "PATCH", headers: users.shipperA, body: { paymentStatus: "PAID", expectedVersion: 2 } })).response.status, 200);
  assert.equal((await api(`/api/shipments?id=${flowId}`, { method: "PATCH", headers: users.provider, body: { status: "PICKUP_SCHEDULED", expectedVersion: 3, details: { pickupAt: "2027-01-02T09:00:00.000Z", vehicle: "KZ 123 ABC", driver: "Иван +77010000000" } } })).response.status, 200);
  assert.equal((await api(`/api/shipments?id=${flowId}`, { method: "PATCH", headers: users.provider, body: { status: "IN_TRANSIT", expectedVersion: 4, details: { actualPickupAt: "2027-01-02T09:15:00.000Z" } } })).response.status, 200);
  const boundary = "----atlas-test-pod";
  const podBody = `--${boundary}\r\nContent-Disposition: form-data; name="shipmentId"\r\n\r\n${flowId}\r\n--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="pod-flow.pdf"\r\nContent-Type: application/pdf\r\n\r\nsigned POD\r\n--${boundary}--\r\n`;
  const podResponse = await mf.dispatchFetch("http://atlas.test/api/shipment-documents", { method: "POST", headers: { ...users.provider, "content-type": `multipart/form-data; boundary=${boundary}` }, body: podBody });
  assert.equal(podResponse.status, 201);
  const podDocument = await podResponse.json();
  assert.equal((await api(`/api/shipments?id=${flowId}`, { method: "PATCH", headers: users.provider, body: { status: "DELIVERED", expectedVersion: 5, details: { deliveredAt: "2027-01-04T10:00:00.000Z", podReference: "POD-FLOW-1", podDocumentId: podDocument.documentId } } })).response.status, 200);
  assert.equal((await api(`/api/shipments?id=${flowId}`, { method: "PATCH", headers: users.provider, body: { status: "CLOSED", expectedVersion: 6 } })).response.status, 403);
  assert.equal((await api(`/api/shipments?id=${flowId}`, { method: "PATCH", headers: users.shipperA, body: { status: "CLOSED", expectedVersion: 6, note: "Груз получен" } })).response.status, 200);
  const completedFlow = await db.prepare("SELECT status, payment_status AS paymentStatus, invoice_number AS invoiceNumber, pod_reference AS podReference, pod_document_id AS podDocumentId FROM shipments WHERE id = ?").bind(flowId).first();
  assert.deepEqual(completedFlow, { status: "CLOSED", paymentStatus: "PAID", invoiceNumber: "INV-FLOW-1", podReference: "POD-FLOW-1", podDocumentId: podDocument.documentId });

  const bootstrapResults = await Promise.all([
    api("/api/platform/bootstrap", {
      method: "POST", headers: { ...identity("platform-owner", "owner@atlas.kz"), authorization: "Bearer stage-one-bootstrap-token-123456" },
    }),
    api("/api/platform/bootstrap", {
      method: "POST", headers: { ...identity("platform-attacker", "attacker@atlas.kz"), authorization: "Bearer stage-one-bootstrap-token-123456" },
    }),
  ]);
  assert.deepEqual(bootstrapResults.map((result) => result.response.status).sort(), [201, 409]);
  const platformOwners = await db.prepare(`
    SELECT COUNT(*) AS count FROM organization_memberships m JOIN organizations o ON o.id = m.organization_id
    WHERE o.kind = 'PLATFORM' AND m.role = 'OWNER' AND m.status = 'ACTIVE'
  `).first();
  const bootstrapClaims = await db.prepare("SELECT COUNT(*) AS count FROM platform_bootstrap_claims").first();
  assert.equal(Number(platformOwners.count), 1);
  assert.equal(Number(bootstrapClaims.count), 1);

  const auditCount = await db.prepare("SELECT COUNT(*) AS count FROM audit_events WHERE entity_id = ?").bind(booked.payload.shipmentId).first();
  assert.ok(Number(auditCount.count) >= 2);
  await db.prepare("DROP TABLE audit_events").run();
  const failedAuditedTransition = await api(`/api/shipments?id=${booked.payload.shipmentId}`, {
    method: "PATCH", headers: users.provider, body: { status: "PICKUP_SCHEDULED", expectedVersion: 2, details: { pickupAt: "2027-01-10T09:00:00.000Z", vehicle: "KZ 123 ABC", driver: "Иван +77010000000" } },
  });
  assert.equal(failedAuditedTransition.response.status, 500);
  const unchangedShipment = await db.prepare("SELECT status, version FROM shipments WHERE id = ?").bind(booked.payload.shipmentId).first();
  assert.deepEqual(unchangedShipment, { status: "PROVIDER_ACCEPTED", version: 2 });
  const orphanMilestone = await db.prepare("SELECT COUNT(*) AS count FROM milestones WHERE shipment_id = ? AND status = 'PICKUP_SCHEDULED'").bind(booked.payload.shipmentId).first();
  assert.equal(Number(orphanMilestone.count), 0, "status and milestone must roll back when audit persistence fails");
  } finally {
    await mf.dispose();
  }
});
