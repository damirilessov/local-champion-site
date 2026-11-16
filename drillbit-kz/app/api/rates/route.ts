import { auditStatement, errorResponse, HttpError, requireApiContext } from "@/lib/authz";
import { canonicalizeLocation, isSupportedLocation } from "@/lib/locations";

type Payload = {
  origin?: string; destination?: string; mode?: string; basePrice?: number;
  perKg?: number; perCbm?: number; fuelPercent?: number; handlingFee?: number;
  minimumCharge?: number; currency?: string; transitDays?: number;
  effectiveFrom?: string; validUntil?: string;
};

const currencies = new Set(["USD", "KZT", "EUR", "CNY"]);

export async function POST(request: Request) {
  try {
    const ctx = await requireApiContext(request, {
      kinds: ["PROVIDER"], roles: ["OWNER", "ADMIN", "OPERATIONS"],
    });
    const payload = await request.json() as Payload;
    const origin = payload.origin ? canonicalizeLocation(payload.origin) : "";
    const destination = payload.destination ? canonicalizeLocation(payload.destination) : "";
    const mode = payload.mode?.trim() || "Авто";
    const basePrice = Number(payload.basePrice);
    const perKg = Number(payload.perKg ?? 0);
    const perCbm = Number(payload.perCbm ?? 0);
    const fuelPercent = Number(payload.fuelPercent ?? 0);
    const handlingFee = Number(payload.handlingFee ?? 0);
    const minimumCharge = Number(payload.minimumCharge ?? 0);
    const transitDays = Number(payload.transitDays);
    const currency = payload.currency?.toUpperCase() || "USD";
    const effectiveFrom = payload.effectiveFrom ? new Date(payload.effectiveFrom) : new Date();
    const validUntil = payload.validUntil ? new Date(payload.validUntil) : new Date(Date.now() + 90 * 86_400_000);
    const numbers = [basePrice, perKg, perCbm, fuelPercent, handlingFee, minimumCharge];
    if (!isSupportedLocation(origin) || !isSupportedLocation(destination) || origin === destination || numbers.some((value) => !Number.isFinite(value) || value < 0)
      || basePrice <= 0 || !Number.isInteger(transitDays) || transitDays <= 0 || transitDays > 365
      || fuelPercent > 100 || !currencies.has(currency) || Number.isNaN(effectiveFrom.getTime())
      || Number.isNaN(validUntil.getTime()) || validUntil <= effectiveFrom) {
      throw new HttpError(400, "Проверьте маршрут, стоимость и срок действия тарифа");
    }

    const previous = await ctx.db.prepare(`
      SELECT id, version FROM rates WHERE provider_id = ? AND origin = ? AND destination = ? AND mode = ?
      ORDER BY version DESC LIMIT 1
    `).bind(ctx.membership.organizationId, origin, destination, mode).first<{ id: string; version: number }>();
    const id = crypto.randomUUID();
    const version = Number(previous?.version ?? 0) + 1;
    const rateSnapshot = {
      providerId: ctx.membership.organizationId, origin, destination, mode, version,
      basePrice, perKg, perCbm, fuelPercent, handlingFee, minimumCharge, currency,
      transitDays, effectiveFrom: effectiveFrom.toISOString(), validUntil: validUntil.toISOString(),
    };
    await ctx.db.batch([
      ctx.db.prepare(`
        INSERT INTO rates (
          id, provider_id, origin, destination, mode, version, base_price, per_kg,
          per_cbm, fuel_percent, handling_fee, minimum_charge, currency, transit_days,
          effective_from, valid_until, created_by_user_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        id, ctx.membership.organizationId, origin, destination, mode, version, basePrice,
        perKg, perCbm, fuelPercent, handlingFee, minimumCharge, currency, transitDays,
        effectiveFrom.toISOString(), validUntil.toISOString(), ctx.user.id,
      ),
      auditStatement(ctx.db, {
        actorUserId: ctx.user.id,
        actorOrganizationId: ctx.membership.organizationId,
        action: "RATE_PUBLISHED",
        entityType: "rate",
        entityId: id,
        before: previous ?? null,
        after: rateSnapshot,
        requestId: ctx.requestId,
      }),
    ]);
    return Response.json({ id, version }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
