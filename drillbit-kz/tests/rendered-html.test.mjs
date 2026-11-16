import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { calculateQuote } from "../lib/pricing.ts";
import { canActorSetStatus, canTransitionShipment, shipmentTransitions } from "../lib/workflow.ts";

async function fetchWorker(path = "/", init = {}) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${Math.random()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request(`http://localhost${path}`, { headers: { accept: "text/html", ...init.headers }, ...init }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("anonymous visitors receive a sign-in gate, not company data", async () => {
  const response = await fetchWorker();
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /<title>Champion Freights/);
  assert.match(html, />Войти</);
  assert.doesNotMatch(html, /Мои перевозки|Платформа под контролем|AF-24081/);
});

test("every protected API uses the centralized server authorization guard", async () => {
  const routes = ["state", "audit", "invitations", "quote-requests", "rates", "shipments"];
  for (const route of routes) {
    const source = await readFile(new URL(`../app/api/${route}/route.ts`, import.meta.url), "utf8");
    assert.match(source, /requireApiContext\(request/, `${route} must use the server guard`);
  }
  const authz = await readFile(new URL("../lib/authz.ts", import.meta.url), "utf8");
  assert.match(authz, /throw new HttpError\(401/);
  assert.match(authz, /throw new HttpError\(403/);
});

test("shipment state machine allows only explicit forward transitions", () => {
  assert.equal(canTransitionShipment("BOOKING_VERIFICATION", "SENT_TO_PROVIDER"), true);
  assert.equal(canTransitionShipment("BOOKING_VERIFICATION", "IN_TRANSIT"), false);
  assert.equal(canTransitionShipment("CLOSED", "IN_TRANSIT"), false);
  assert.equal(canTransitionShipment("CANCELLED", "BOOKING_VERIFICATION"), false);
  for (const [from, allowed] of Object.entries(shipmentTransitions)) {
    for (const to of Object.keys(shipmentTransitions)) {
      assert.equal(canTransitionShipment(from, to), allowed.includes(to), `${from} → ${to}`);
    }
  }
  assert.equal(canActorSetStatus("SHIPPER", "CANCELLED"), true);
  assert.equal(canActorSetStatus("SHIPPER", "CLOSED"), true);
  assert.equal(canActorSetStatus("SHIPPER", "IN_TRANSIT"), false);
  assert.equal(canActorSetStatus("PROVIDER", "CANCELLED"), true);
  assert.equal(canActorSetStatus("PROVIDER", "DELIVERED"), true);
  assert.equal(canActorSetStatus("PROVIDER", "CLOSED"), false);
});

test("quote calculation is deterministic and stores a reproducible snapshot", () => {
  const rate = {
    id: "rate-1", version: 3, basePrice: 1000, perKg: 0.5, perCbm: 20,
    fuelPercent: 10, handlingFee: 40, minimumCharge: 1200, currency: "USD", transitDays: 7,
  };
  const first = calculateQuote(rate, 100, 2);
  const second = calculateQuote(rate, 100, 2);
  assert.deepEqual(first, second);
  assert.equal(first.price, 1239);
  const snapshot = JSON.parse(first.snapshot);
  assert.equal(snapshot.rateVersion, 3);
  assert.deepEqual(snapshot.inputs, { weightKg: 100, volumeCbm: 2 });
  assert.equal(snapshot.breakdown.price, first.price);
});

test("routes enforce membership-derived roles and tenant predicates", async () => {
  const files = await Promise.all([
    "../app/api/state/route.ts", "../app/api/quote-requests/route.ts",
    "../app/api/rates/route.ts", "../app/api/shipments/route.ts",
  ].map((path) => readFile(new URL(path, import.meta.url), "utf8")));
  const source = files.join("\n");
  assert.doesNotMatch(source, /org-shipper|provider-silk/);
  assert.match(source, /requireApiContext/);
  assert.match(files[0], /shipper_id = \?|provider_id = \?/);
  assert.match(files[1], /ctx\.membership\.organizationId/);
  assert.match(files[2], /kinds: \["PROVIDER"\]/);
  assert.match(files[3], /qr\.shipper_id = \?|scopeColumn/);
});

test("production runtime no longer creates or seeds schema on requests", async () => {
  const runtime = await readFile(new URL("../db/runtime.ts", import.meta.url), "utf8");
  const migration = await readFile(new URL("../drizzle/0001_famous_nemesis.sql", import.meta.url), "utf8");
  assert.doesNotMatch(runtime, /CREATE TABLE|seed\(/i);
  assert.match(migration, /CREATE TABLE `users`/);
  assert.match(migration, /CREATE TABLE `organization_memberships`/);
  assert.match(migration, /CREATE TABLE `audit_events`/);
  assert.match(migration, /pricing_snapshot/);
});

test("migration preserves legacy records while adding stage-one ownership fields", async () => {
  const database = new DatabaseSync(":memory:");
  const apply = async (name) => {
    const sql = await readFile(new URL(`../drizzle/${name}`, import.meta.url), "utf8");
    for (const statement of sql.split("--> statement-breakpoint").map((part) => part.trim()).filter(Boolean)) {
      database.exec(statement);
    }
  };
  await apply("0000_small_skreet.sql");
  database.exec("PRAGMA foreign_keys=ON");
  database.exec(`
    INSERT INTO organizations (id, name, kind) VALUES ('shipper', 'Shipper', 'SHIPPER'), ('provider', 'Provider', 'PROVIDER');
    INSERT INTO rates (id, provider_id, origin, destination, mode, base_price, transit_days, valid_until) VALUES ('rate', 'provider', 'A', 'B', 'Авто', 100, 2, '2030-01-01');
    INSERT INTO quote_requests (id, shipper_id, origin, destination, load_type, units, weight_kg, volume_cbm) VALUES ('request', 'shipper', 'A', 'B', 'Паллеты', 1, 10, 1);
    INSERT INTO quotes (id, request_id, rate_id, provider_id, price, currency, transit_days, expires_at) VALUES ('quote', 'request', 'rate', 'provider', 120, 'USD', 2, '2030-01-01');
    INSERT INTO shipments (id, reference, quote_id, shipper_id, provider_id, origin, destination, price, currency, eta) VALUES ('shipment', 'AF-OLD', 'quote', 'shipper', 'provider', 'A', 'B', 120, 'USD', '2030-01-01');
    INSERT INTO milestones (id, shipment_id, status) VALUES ('milestone', 'shipment', 'BOOKING_VERIFICATION');
  `);
  database.exec("BEGIN");
  try {
    await apply("0001_famous_nemesis.sql");
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
  database.exec("BEGIN");
  try {
    await apply("0002_tough_callisto.sql");
    await apply("0003_broken_lethal_legion.sql");
    await apply("0004_whole_scarlet_witch.sql");
    await apply("0005_silent_firelord.sql");
    await apply("0006_jittery_star_brand.sql");
    await apply("0007_petite_stryfe.sql");
    await apply("0008_shiny_toxin.sql");
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
  const migrated = database.prepare(`
    SELECT qr.created_by_user_id AS actor, qr.mode, qr.ready_date AS readyDate, q.rate_version AS rateVersion,
      shipper.profile_type AS profileType, shipper.is_demo AS isDemo, qr.cargo_items_json AS cargoItemsJson,
      q.pricing_snapshot AS snapshot, s.version, m.actor_organization_id AS milestoneOrg
    FROM quote_requests qr JOIN quotes q ON q.request_id = qr.id
    JOIN organizations shipper ON shipper.id = qr.shipper_id
    JOIN shipments s ON s.quote_id = q.id JOIN milestones m ON m.shipment_id = s.id
    WHERE qr.id = 'request'
  `).get();
  assert.equal(migrated.actor, "migration-system");
  assert.equal(migrated.mode, "Авто");
  assert.ok(migrated.readyDate);
  assert.equal(migrated.profileType, "BUSINESS");
  assert.equal(migrated.isDemo, 0);
  assert.deepEqual(JSON.parse(migrated.cargoItemsJson), []);
  assert.equal(migrated.rateVersion, 1);
  assert.equal(migrated.version, 1);
  assert.equal(migrated.milestoneOrg, "platform-atlas");
  assert.equal(JSON.parse(migrated.snapshot).legacy, 1);
  database.close();
});
