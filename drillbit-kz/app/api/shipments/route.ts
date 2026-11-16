import { errorResponse, HttpError, requireApiContext } from "@/lib/authz";
import { canActorSetStatus, canTransitionShipment, isShipmentStatus } from "@/lib/workflow";

export async function POST(request: Request) {
  try {
    const ctx = await requireApiContext(request, {
      kinds: ["SHIPPER"], roles: ["OWNER", "ADMIN", "OPERATIONS"],
    });
    const payload = await request.json() as { quoteId?: string; details?: { pickupAddress?: string; deliveryAddress?: string; contactName?: string; contactPhone?: string; cargoDescription?: string; incoterm?: string; specialRequirements?: string } };
    if (!payload.quoteId) throw new HttpError(400, "Не выбрано предложение");
    const details = payload.details ?? {};
    const pickupAddress = details.pickupAddress?.trim() ?? "";
    const deliveryAddress = details.deliveryAddress?.trim() ?? "";
    const contactName = details.contactName?.trim() ?? "";
    const contactPhone = details.contactPhone?.trim() ?? "";
    const cargoDescription = details.cargoDescription?.trim() ?? "";
    const incoterm = details.incoterm?.trim() ?? "EXW";
    const specialRequirements = details.specialRequirements?.trim() ?? "";
    if ([pickupAddress, deliveryAddress, contactName, contactPhone, cargoDescription].some((value) => value.length < 3)
      || !["EXW", "FCA", "FOB", "CIF", "DAP", "DDP"].includes(incoterm)) {
      throw new HttpError(400, "Заполните адреса, контакт, описание груза и Incoterms");
    }

    const existing = await ctx.db.prepare(`
      SELECT s.id AS shipmentId, s.reference FROM shipments s
      JOIN quotes q ON q.id = s.quote_id JOIN quote_requests qr ON qr.id = q.request_id
      WHERE s.quote_id = ? AND qr.shipper_id = ?
    `).bind(payload.quoteId, ctx.membership.organizationId).first<{ shipmentId: string; reference: string }>();
    if (existing) return Response.json(existing, { status: 200 });

    const quote = await ctx.db.prepare(`
      SELECT q.id, q.provider_id AS providerId, q.price, q.currency,
        q.transit_days AS transitDays, qr.origin, qr.destination, qr.ready_date AS readyDate
      FROM quotes q JOIN quote_requests qr ON qr.id = q.request_id
      JOIN organizations provider ON provider.id = q.provider_id
      WHERE q.id = ? AND qr.shipper_id = ? AND q.status = 'ACTIVE'
        AND provider.is_demo = 0 AND julianday(q.expires_at) > julianday('now')
    `).bind(payload.quoteId, ctx.membership.organizationId).first<Record<string, unknown>>();
    if (!quote) throw new HttpError(404, "Предложение недоступно или срок его действия истёк");

    const shipmentId = crypto.randomUUID();
    const reference = `AF-${crypto.randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase()}`;
    const serviceStart = Math.max(Date.now(), new Date(String(quote.readyDate)).getTime());
    const eta = new Date(serviceStart + Number(quote.transitDays) * 86_400_000).toISOString();
    try {
      const bookingAudit = JSON.stringify({
        reference, quoteId: quote.id, providerId: quote.providerId,
        price: quote.price, currency: quote.currency,
      });
      const result = await ctx.db.batch([
        ctx.db.prepare(`
          INSERT INTO shipments (
            id, reference, quote_id, shipper_id, provider_id, origin, destination,
            status, price, currency, eta
          )
          SELECT ?, ?, q.id, qr.shipper_id, q.provider_id, qr.origin, qr.destination,
            'SENT_TO_PROVIDER', q.price, q.currency, ?
          FROM quotes q JOIN quote_requests qr ON qr.id = q.request_id
          JOIN organizations provider ON provider.id = q.provider_id
          WHERE q.id = ? AND qr.shipper_id = ? AND q.status = 'ACTIVE'
            AND provider.is_demo = 0 AND julianday(q.expires_at) > julianday('now')
        `).bind(
          shipmentId, reference, eta, quote.id, ctx.membership.organizationId,
        ),
        ctx.db.prepare(`
          UPDATE quotes SET status = 'BOOKED'
          WHERE changes() = 1 AND id = ? AND status = 'ACTIVE'
            AND EXISTS (SELECT 1 FROM shipments WHERE quote_id = ?)
        `).bind(quote.id, quote.id),
        ctx.db.prepare(`
          UPDATE quote_requests SET status = 'BOOKED', pickup_address = ?, delivery_address = ?,
            contact_name = ?, contact_phone = ?, cargo_description = ?, incoterm = ?, special_requirements = ?
          WHERE changes() = 1 AND id = (SELECT request_id FROM quotes WHERE id = ?)
            AND EXISTS (SELECT 1 FROM shipments WHERE quote_id = ?)
        `).bind(pickupAddress, deliveryAddress, contactName, contactPhone, cargoDescription, incoterm, specialRequirements, quote.id, quote.id),
        ctx.db.prepare(`
          INSERT INTO milestones (id, shipment_id, status, note, actor_user_id, actor_organization_id)
          SELECT ?, ?, 'SENT_TO_PROVIDER', ?, ?, ?
          WHERE changes() = 1 AND EXISTS (SELECT 1 FROM shipments WHERE id = ?)
        `).bind(crypto.randomUUID(), shipmentId, "Бронирование направлено логистической компании", ctx.user.id, ctx.membership.organizationId, shipmentId),
        ctx.db.prepare(`
          INSERT INTO audit_events (
            id, actor_user_id, actor_organization_id, action, entity_type, entity_id,
            before_json, after_json, request_id
          )
          SELECT ?, ?, ?, 'SHIPMENT_BOOKED', 'shipment', ?, NULL, ?, ?
          WHERE changes() = 1 AND EXISTS (SELECT 1 FROM shipments WHERE id = ?)
        `).bind(
          crypto.randomUUID(), ctx.user.id, ctx.membership.organizationId,
          shipmentId, bookingAudit, ctx.requestId, shipmentId,
        ),
      ]);
      if (result[0].meta.changes !== 1 || result[1].meta.changes !== 1) {
        throw new HttpError(409, "Предложение уже забронировано");
      }
    } catch (error) {
      const concurrent = await ctx.db.prepare(`
        SELECT id AS shipmentId, reference FROM shipments WHERE quote_id = ? AND shipper_id = ?
      `).bind(payload.quoteId, ctx.membership.organizationId).first();
      if (concurrent) return Response.json(concurrent, { status: 200 });
      throw error;
    }
    return Response.json({ shipmentId, reference }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const ctx = await requireApiContext(request, {
      kinds: ["SHIPPER", "PROVIDER", "PLATFORM"], roles: ["OWNER", "ADMIN", "OPERATIONS"],
    });
    const id = new URL(request.url).searchParams.get("id");
    const payload = await request.json() as { status?: string; paymentStatus?: string; expectedVersion?: number; note?: string; details?: { pickupAt?: string; vehicle?: string; driver?: string; actualPickupAt?: string; deliveredAt?: string; podReference?: string; podDocumentId?: string; invoiceNumber?: string } };
    if (!id) throw new HttpError(400, "Не выбрана перевозка");
    const scopeColumn = ctx.membership.organizationKind === "SHIPPER" ? "shipper_id"
      : ctx.membership.organizationKind === "PROVIDER" ? "provider_id" : null;
    const shipment = await ctx.db.prepare(`
      SELECT id, status, version, shipper_id AS shipperId, provider_id AS providerId,
        actual_pickup_at AS actualPickupAt, payment_status AS paymentStatus
      FROM shipments WHERE id = ? ${scopeColumn ? `AND ${scopeColumn} = ?` : ""}
    `).bind(...(scopeColumn ? [id, ctx.membership.organizationId] : [id])).first<Record<string, unknown>>();
    if (!shipment) throw new HttpError(404, "Перевозка не найдена");
    const expectedVersion = Number(payload.expectedVersion ?? shipment.version);
    if (payload.paymentStatus === "PAID") {
      if (ctx.membership.organizationKind !== "SHIPPER") throw new HttpError(403, "Оплату подтверждает клиент");
      if (shipment.paymentStatus !== "INVOICED") throw new HttpError(409, "Счёт ещё не выставлен или уже оплачен");
      const result = await ctx.db.batch([
        ctx.db.prepare("UPDATE shipments SET payment_status = 'PAID', version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND payment_status = 'INVOICED' AND version = ?").bind(id, expectedVersion),
        ctx.db.prepare("INSERT INTO milestones (id, shipment_id, status, note, actor_user_id, actor_organization_id) SELECT ?, ?, status, 'Клиент подтвердил оплату счёта', ?, ? FROM shipments WHERE changes() = 1 AND id = ? AND version = ?").bind(crypto.randomUUID(), id, ctx.user.id, ctx.membership.organizationId, id, expectedVersion + 1),
        ctx.db.prepare("INSERT INTO audit_events (id, actor_user_id, actor_organization_id, action, entity_type, entity_id, before_json, after_json, request_id) SELECT ?, ?, ?, 'SHIPMENT_PAYMENT_CONFIRMED', 'shipment', ?, ?, ?, ? WHERE changes() = 1 AND EXISTS (SELECT 1 FROM shipments WHERE id = ? AND version = ?)").bind(crypto.randomUUID(), ctx.user.id, ctx.membership.organizationId, id, JSON.stringify({ paymentStatus: "INVOICED" }), JSON.stringify({ paymentStatus: "PAID" }), ctx.requestId, id, expectedVersion + 1),
      ]);
      if (result[0].meta.changes !== 1) throw new HttpError(409, "Оплата уже обновлена другим пользователем");
      return Response.json({ updated: true, version: expectedVersion + 1 });
    }
    if (!payload.status || !isShipmentStatus(payload.status)) throw new HttpError(400, "Некорректный статус");
    if (!canTransitionShipment(String(shipment.status), payload.status)) {
      throw new HttpError(409, `Переход ${shipment.status} → ${payload.status} запрещён`);
    }
    if (!canActorSetStatus(ctx.membership.organizationKind, payload.status)) {
      throw new HttpError(403, "Эта роль не может установить выбранный статус");
    }
    const details = payload.details ?? {};
    let note = payload.note?.trim() ?? "";
    const validDate = (value?: string) => Boolean(value && !Number.isNaN(new Date(value).getTime()));
    if (payload.status === "CANCELLED" && note.length < 3) throw new HttpError(400, "Добавьте причину отмены");
    if (payload.status === "PICKUP_SCHEDULED") {
      if (!validDate(details.pickupAt) || (details.vehicle?.trim().length ?? 0) < 2) throw new HttpError(400, "Укажите дату забора и транспорт");
      note = `Забор: ${details.pickupAt}; транспорт: ${details.vehicle?.trim()}${details.driver?.trim() ? `; водитель: ${details.driver.trim()}` : ""}`;
    }
    if (payload.status === "IN_TRANSIT") {
      if (shipment.status === "PICKUP_SCHEDULED") {
        if (!validDate(details.actualPickupAt)) throw new HttpError(400, "Укажите фактическое время забора");
        note = `Груз забран: ${details.actualPickupAt}`;
      } else note = "Таможня пройдена, перевозка продолжается";
    }
    if (payload.status === "DELIVERED") {
      if (!validDate(details.deliveredAt) || (details.podReference?.trim().length ?? 0) < 3 || !details.podDocumentId) throw new HttpError(400, "Укажите время доставки, номер и файл POD");
      const pod = await ctx.db.prepare("SELECT id FROM shipment_documents WHERE id = ? AND shipment_id = ? AND kind = 'POD' AND uploaded_by_organization_id = ?").bind(details.podDocumentId, id, ctx.membership.organizationId).first();
      if (!pod) throw new HttpError(400, "Файл POD не найден для этой перевозки");
      note = `Доставлено: ${details.deliveredAt}; POD: ${details.podReference?.trim()}`;
    }
    if (payload.status === "PROVIDER_ACCEPTED" && (details.invoiceNumber?.trim().length ?? 0) < 3) throw new HttpError(400, "Укажите номер счёта");
    if (payload.status === "CLOSED" && shipment.paymentStatus !== "PAID") throw new HttpError(409, "Сначала подтвердите оплату счёта");
    const beforeJson = JSON.stringify({ status: shipment.status, version: expectedVersion });
    const afterJson = JSON.stringify({ status: payload.status, version: expectedVersion + 1, note });
    const result = await ctx.db.batch([
      ctx.db.prepare(`
        UPDATE shipments SET status = ?, version = version + 1, updated_at = CURRENT_TIMESTAMP,
          pickup_at = CASE WHEN ? = 'PICKUP_SCHEDULED' THEN ? ELSE pickup_at END,
          vehicle = CASE WHEN ? = 'PICKUP_SCHEDULED' THEN ? ELSE vehicle END,
          driver = CASE WHEN ? = 'PICKUP_SCHEDULED' THEN ? ELSE driver END,
          actual_pickup_at = CASE WHEN ? = 'IN_TRANSIT' THEN ? ELSE actual_pickup_at END,
          delivered_at = CASE WHEN ? = 'DELIVERED' THEN ? ELSE delivered_at END,
          pod_reference = CASE WHEN ? = 'DELIVERED' THEN ? ELSE pod_reference END
          , pod_document_id = CASE WHEN ? = 'DELIVERED' THEN ? ELSE pod_document_id END
          , invoice_number = CASE WHEN ? = 'PROVIDER_ACCEPTED' THEN ? ELSE invoice_number END
          , payment_status = CASE WHEN ? = 'PROVIDER_ACCEPTED' THEN 'INVOICED' ELSE payment_status END
        WHERE id = ? AND status = ? AND version = ?
      `).bind(payload.status,
        payload.status, details.pickupAt ?? null, payload.status, details.vehicle?.trim() ?? null,
        payload.status, details.driver?.trim() ?? null, payload.status, details.actualPickupAt ?? null,
        payload.status, details.deliveredAt ?? null, payload.status, details.podReference?.trim() ?? null,
        payload.status, details.podDocumentId ?? null,
        payload.status, details.invoiceNumber?.trim() ?? null, payload.status,
        id, shipment.status, expectedVersion),
      ctx.db.prepare(`
        INSERT INTO milestones (id, shipment_id, status, note, actor_user_id, actor_organization_id)
        SELECT ?, ?, ?, ?, ?, ? WHERE changes() = 1 AND EXISTS (
          SELECT 1 FROM shipments WHERE id = ? AND status = ? AND version = ?
        )
      `).bind(
        crypto.randomUUID(), id, payload.status, note || "Статус обновлён", ctx.user.id,
        ctx.membership.organizationId, id, payload.status, expectedVersion + 1,
      ),
      ctx.db.prepare(`
        INSERT INTO audit_events (
          id, actor_user_id, actor_organization_id, action, entity_type, entity_id,
          before_json, after_json, request_id
        )
        SELECT ?, ?, ?, 'SHIPMENT_STATUS_CHANGED', 'shipment', ?, ?, ?, ? WHERE changes() = 1 AND EXISTS (
          SELECT 1 FROM shipments WHERE id = ? AND status = ? AND version = ?
        )
      `).bind(
        crypto.randomUUID(), ctx.user.id, ctx.membership.organizationId, id,
        beforeJson, afterJson, ctx.requestId, id, payload.status, expectedVersion + 1,
      ),
    ]);
    if (result[0].meta.changes !== 1) throw new HttpError(409, "Перевозка уже была обновлена другим пользователем");
    return Response.json({ updated: true, version: expectedVersion + 1 });
  } catch (error) {
    return errorResponse(error);
  }
}
