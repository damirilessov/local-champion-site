import { compactDate, statusLabel } from "@/db/runtime";
import { errorResponse, requireApiContext } from "@/lib/authz";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const ctx = await requireApiContext(request);
    const { organizationId, organizationKind } = ctx.membership;
    const shipmentScope = organizationKind === "SHIPPER" ? "s.shipper_id = ?"
      : organizationKind === "PROVIDER" ? "s.provider_id = ?" : "1 = 1";
    const quoteScope = organizationKind === "SHIPPER" ? "qr.shipper_id = ?"
      : organizationKind === "PROVIDER" ? "q.provider_id = ?" : "1 = 1";
    const rateScope = organizationKind === "PROVIDER" ? "r.provider_id = ?"
      : organizationKind === "SHIPPER" ? "0 = 1" : "1 = 1";
    const scopeParams = organizationKind === "PLATFORM" ? [] : [organizationId];

    const [requestResult, quoteResult, shipmentResult, rateResult, milestoneResult, openRequestCount, providerCount] = await Promise.all([
      organizationKind === "SHIPPER" ? ctx.db.prepare(`
        SELECT qr.id, qr.origin, qr.destination, qr.load_type AS loadType, qr.mode,
          qr.units, qr.weight_kg AS weightKg, qr.volume_cbm AS volumeCbm,
          qr.cargo_items_json AS cargoItemsJson, qr.ready_date AS readyDate, qr.status,
          qr.pickup_address AS pickupAddress, qr.delivery_address AS deliveryAddress,
          qr.contact_name AS contactName, qr.contact_phone AS contactPhone,
          qr.cargo_description AS cargoDescription, qr.incoterm, qr.special_requirements AS specialRequirements,
          SUM(CASE WHEN q.status = 'ACTIVE' AND julianday(q.expires_at) > julianday('now') THEN 1 ELSE 0 END) AS quoteCount
        FROM quote_requests qr LEFT JOIN quotes q ON q.request_id = qr.id
        WHERE qr.shipper_id = ? GROUP BY qr.id ORDER BY qr.created_at DESC LIMIT 20
      `).bind(organizationId).all() : Promise.resolve({ results: [] }),
      ctx.db.prepare(`
        SELECT q.id, q.request_id AS requestId, o.name AS provider, o.is_demo AS isDemo,
          upper(substr(o.name, 1, 1) || substr(o.name, instr(o.name, ' ') + 1, 1)) AS providerCode,
          q.price, q.currency, q.transit_days AS transitDays, r.mode, coalesce(o.rating, 0) AS rating,
          qr.origin, qr.destination, qr.load_type AS loadType, qr.mode AS requestedMode,
          qr.units, qr.weight_kg AS weightKg, qr.volume_cbm AS volumeCbm, qr.cargo_items_json AS cargoItemsJson,
          qr.ready_date AS readyDate, qr.pickup_address AS pickupAddress, qr.delivery_address AS deliveryAddress,
          qr.contact_name AS contactName, qr.contact_phone AS contactPhone, qr.cargo_description AS cargoDescription,
          qr.incoterm, qr.special_requirements AS specialRequirements,
          q.expires_at AS expiresAt, q.pricing_snapshot AS pricingSnapshot
        FROM quotes q
        JOIN organizations o ON o.id = q.provider_id
        JOIN rates r ON r.id = q.rate_id
        JOIN quote_requests qr ON qr.id = q.request_id
        WHERE ${quoteScope} AND q.status = 'ACTIVE' AND julianday(q.expires_at) > julianday('now')
        ORDER BY q.created_at DESC, q.price ASC LIMIT 20
      `).bind(...scopeParams).all(),
      ctx.db.prepare(`
        SELECT s.id, s.reference, provider.name AS provider, shipper.name AS shipper,
          s.origin, s.destination, s.status, s.price, s.currency, s.eta AS etaAt, s.version,
          s.pickup_at AS pickupAt, s.vehicle, s.driver, s.actual_pickup_at AS actualPickupAt,
          s.delivered_at AS deliveredAt, s.pod_reference AS podReference,
          s.pod_document_id AS podDocumentId, pod.file_name AS podFileName,
          s.invoice_number AS invoiceNumber, s.payment_status AS paymentStatus,
          qr.load_type AS loadType, r.mode, qr.units, qr.weight_kg AS weightKg,
          qr.volume_cbm AS volumeCbm, qr.cargo_items_json AS cargoItemsJson, qr.ready_date AS readyDate,
          qr.pickup_address AS pickupAddress, qr.delivery_address AS deliveryAddress,
          qr.contact_name AS contactName, qr.contact_phone AS contactPhone, qr.cargo_description AS cargoDescription,
          qr.incoterm, qr.special_requirements AS specialRequirements,
          q.pricing_snapshot AS pricingSnapshot, q.rate_version AS rateVersion,
          s.updated_at AS updatedAt
        FROM shipments s
        JOIN organizations provider ON provider.id = s.provider_id
        JOIN organizations shipper ON shipper.id = s.shipper_id
        JOIN quotes q ON q.id = s.quote_id
        JOIN rates r ON r.id = q.rate_id
        JOIN quote_requests qr ON qr.id = q.request_id
        LEFT JOIN shipment_documents pod ON pod.id = s.pod_document_id
        WHERE ${shipmentScope} ORDER BY s.created_at DESC LIMIT 100
      `).bind(...scopeParams).all(),
      ctx.db.prepare(`
        SELECT r.id, o.name AS provider, r.origin, r.destination, r.mode, r.version,
          r.base_price AS basePrice, r.per_kg AS perKg, r.per_cbm AS perCbm,
          r.fuel_percent AS fuelPercent, r.handling_fee AS handlingFee,
          r.minimum_charge AS minimumCharge, r.currency, r.transit_days AS transitDays,
          r.effective_from AS effectiveFrom, r.valid_until AS validUntil
        FROM rates r JOIN organizations o ON o.id = r.provider_id
        WHERE ${rateScope} AND r.active = 1 ORDER BY r.created_at DESC LIMIT 100
      `).bind(...(organizationKind === "PROVIDER" ? [organizationId] : [])).all(),
      ctx.db.prepare(`
        SELECT m.id, m.shipment_id AS shipmentId, m.status, m.note,
          m.created_at AS createdAt, u.display_name AS actorName, o.name AS actorOrganization
        FROM milestones m
        JOIN shipments s ON s.id = m.shipment_id
        JOIN users u ON u.id = m.actor_user_id
        JOIN organizations o ON o.id = m.actor_organization_id
        WHERE ${shipmentScope} ORDER BY m.created_at ASC
      `).bind(...scopeParams).all(),
      organizationKind === "SHIPPER"
        ? ctx.db.prepare("SELECT COUNT(*) AS count FROM quote_requests WHERE shipper_id = ? AND status IN ('OPEN', 'QUOTED')").bind(organizationId).first<{ count: number }>()
        : organizationKind === "PROVIDER"
          ? ctx.db.prepare(`
              SELECT COUNT(DISTINCT qr.id) AS count FROM quote_requests qr
              JOIN quotes q ON q.request_id = qr.id
              WHERE q.provider_id = ? AND qr.status IN ('OPEN', 'QUOTED')
            `).bind(organizationId).first<{ count: number }>()
          : ctx.db.prepare("SELECT COUNT(*) AS count FROM quote_requests WHERE status IN ('OPEN', 'QUOTED')").first<{ count: number }>(),
      ctx.db.prepare("SELECT COUNT(*) AS count FROM organizations WHERE kind = 'PROVIDER' AND status = 'ACTIVE' AND is_demo = 0").first<{ count: number }>(),
    ]);

    const shipments: Array<Record<string, unknown>> = (shipmentResult.results as Array<Record<string, unknown>>).map((row) => ({
      ...row,
      statusLabel: statusLabel(String(row.status)),
      updatedAt: "обновлено " + compactDate(String(row.updatedAt)),
      eta: compactDate(String(row.etaAt)),
    }));
    const monthlyGmv = shipments
      .filter((shipment) => shipment.status !== "CANCELLED")
      .reduce((sum, shipment) => sum + Number(shipment.price), 0);
    const withCargoItems = (rows: unknown[]) => rows.map((row) => {
      const record = row as Record<string, unknown>;
      let cargoItems: unknown[] = [];
      try { cargoItems = JSON.parse(String(record.cargoItemsJson ?? "[]")) as unknown[]; } catch { /* Legacy request. */ }
      const rest = { ...record };
      delete rest.cargoItemsJson;
      return { ...rest, cargoItems };
    });
    return Response.json({
      quoteRequests: withCargoItems(requestResult.results),
      quotes: withCargoItems(quoteResult.results),
      shipments: withCargoItems(shipments),
      rates: rateResult.results,
      milestones: milestoneResult.results,
      metrics: {
        openRequests: Number(openRequestCount?.count ?? 0),
        activeShipments: shipments.filter((item) => !["CLOSED", "DELIVERED", "CANCELLED"].includes(String(item.status))).length,
        monthlyGmv,
        providers: Number(providerCount?.count ?? 0),
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
