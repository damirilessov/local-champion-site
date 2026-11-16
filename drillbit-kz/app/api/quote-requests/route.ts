import { auditStatement, errorResponse, HttpError, requireApiContext } from "@/lib/authz";
import { calculateQuote, type RateForPricing } from "@/lib/pricing";
import { canonicalizeLocation } from "@/lib/locations";
import { demoRatesForLane, type DemoRate } from "@/lib/demo-rates";

type Payload = {
  origin?: string;
  destination?: string;
  loadType?: string;
  mode?: string;
  units?: number;
  weight?: number;
  volume?: number;
  readyDate?: string;
  cargoItems?: Array<{ quantity?: number; lengthCm?: number; widthCm?: number; heightCm?: number; weightKg?: number }>;
  pickupAddress?: string; deliveryAddress?: string; contactName?: string; contactPhone?: string;
  cargoDescription?: string; incoterm?: string; specialRequirements?: string;
};

export async function POST(request: Request) {
  try {
    const ctx = await requireApiContext(request, {
      kinds: ["SHIPPER"], roles: ["OWNER", "ADMIN", "OPERATIONS"],
    });
    const payload = await request.json() as Payload;
    const origin = payload.origin ? canonicalizeLocation(payload.origin) : "";
    const destination = payload.destination ? canonicalizeLocation(payload.destination) : "";
    const loadType = payload.loadType?.trim() || "Паллеты";
    const mode = payload.mode?.trim() || "Любой";
    const pickupAddress = payload.pickupAddress?.trim() ?? "";
    const deliveryAddress = payload.deliveryAddress?.trim() ?? "";
    const contactName = payload.contactName?.trim() ?? "";
    const contactPhone = payload.contactPhone?.trim() ?? "";
    const cargoDescription = payload.cargoDescription?.trim() ?? "";
    const incoterm = payload.incoterm?.trim() ?? "EXW";
    const specialRequirements = payload.specialRequirements?.trim() ?? "";
    if (!["Любой", "Авто", "Ж/д", "Авиа", "Море"].includes(mode)) throw new HttpError(400, "Некорректный вид перевозки");
    const cargoItems = Array.isArray(payload.cargoItems) ? payload.cargoItems.map((item) => ({
      quantity: Number(item.quantity), lengthCm: Number(item.lengthCm), widthCm: Number(item.widthCm),
      heightCm: Number(item.heightCm), weightKg: Number(item.weightKg),
    })) : [];
    const validCargoItems = cargoItems.length > 0 && cargoItems.length <= 20 && cargoItems.every((item) =>
      Number.isInteger(item.quantity) && item.quantity > 0 && item.quantity <= 10_000
      && [item.lengthCm, item.widthCm, item.heightCm, item.weightKg].every((value) => Number.isFinite(value) && value > 0),
    );
    if (cargoItems.length && !validCargoItems) throw new HttpError(400, "Проверьте количество, габариты и вес каждого места");
    const weight = validCargoItems ? cargoItems.reduce((sum, item) => sum + item.quantity * item.weightKg, 0) : Number(payload.weight);
    const volume = validCargoItems ? cargoItems.reduce((sum, item) => sum + item.quantity * item.lengthCm * item.widthCm * item.heightCm / 1_000_000, 0) : Number(payload.volume ?? 0);
    const units = validCargoItems ? cargoItems.reduce((sum, item) => sum + item.quantity, 0) : Number(payload.units ?? 1);
    const readyDate = payload.readyDate ? new Date(`${payload.readyDate}T00:00:00Z`) : null;
    if (origin.length < 2 || destination.length < 2 || origin.length > 120 || destination.length > 120 || origin === destination || !Number.isFinite(weight) || weight <= 0
      || !Number.isFinite(volume) || volume < 0 || !Number.isInteger(units) || units <= 0
      || !readyDate || Number.isNaN(readyDate.getTime()) || readyDate < new Date(new Date().toISOString().slice(0, 10))) {
      throw new HttpError(400, "Проверьте маршрут и параметры груза");
    }
    if (!["EXW", "FCA", "FOB", "CIF", "DAP", "DDP"].includes(incoterm)) throw new HttpError(400, "Некорректные условия Incoterms");

    const requestId = crypto.randomUUID();
    const rateResult = await ctx.db.prepare(`
      SELECT r.id, r.provider_id AS providerId, r.version, r.base_price AS basePrice,
        r.per_kg AS perKg, r.per_cbm AS perCbm, r.fuel_percent AS fuelPercent,
        r.handling_fee AS handlingFee, r.minimum_charge AS minimumCharge,
        r.currency, r.transit_days AS transitDays, r.mode
      FROM rates r JOIN organizations o ON o.id = r.provider_id
      WHERE r.active = 1 AND o.status = 'ACTIVE' AND r.origin = ? AND r.destination = ?
        AND o.is_demo = 0 AND (? = 'Любой' OR r.mode = ?) AND julianday(r.effective_from) <= julianday(?)
        AND julianday(r.valid_until) > julianday(?)
        AND r.version = (
          SELECT MAX(r2.version) FROM rates r2
          WHERE r2.provider_id = r.provider_id AND r2.origin = r.origin
            AND r2.destination = r.destination AND r2.mode = r.mode AND r2.active = 1
            AND julianday(r2.effective_from) <= julianday(?)
            AND julianday(r2.valid_until) > julianday(?)
        )
      ORDER BY r.base_price ASC LIMIT 20
    `).bind(origin, destination, mode, mode, readyDate.toISOString(), readyDate.toISOString(), readyDate.toISOString(), readyDate.toISOString()).all<RateForPricing & { providerId: string; mode: string }>();
    const liveRates = rateResult.results as Array<RateForPricing & { providerId: string; mode: string }>;
    const demoRates = demoRatesForLane(origin, destination, mode);
    const rates = [...liveRates, ...demoRates];

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const quoteRows = rates.map((rate: RateForPricing & { providerId: string; mode: string }) => ({
      id: crypto.randomUUID(), rate, calculation: calculateQuote(rate, weight, volume, readyDate.toISOString()),
    })).sort((left, right) => left.calculation.price - right.calculation.price).slice(0, 20);
    const status = quoteRows.length ? "QUOTED" : "OPEN";
    const statements = [
      ...demoRates.map((rate: DemoRate) => ctx.db.prepare(`
        INSERT OR IGNORE INTO rates (
          id, provider_id, origin, destination, mode, version, base_price, per_kg,
          per_cbm, fuel_percent, handling_fee, minimum_charge, currency, transit_days,
          effective_from, valid_until, active, created_by_user_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'user-demo-system')
      `).bind(
        rate.id, rate.providerId, origin, destination, rate.mode, rate.version, rate.basePrice,
        rate.perKg, rate.perCbm, rate.fuelPercent, rate.handlingFee, rate.minimumCharge,
        rate.currency, rate.transitDays, rate.effectiveFrom, rate.validUntil,
      )),
      ctx.db.prepare(`
        INSERT INTO quote_requests (
          id, shipper_id, created_by_user_id, origin, destination, load_type, mode,
          units, weight_kg, volume_cbm, cargo_items_json, pickup_address, delivery_address,
          contact_name, contact_phone, cargo_description, incoterm, special_requirements, ready_date, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(requestId, ctx.membership.organizationId, ctx.user.id, origin, destination, loadType, mode, units, weight, volume, JSON.stringify(validCargoItems ? cargoItems : []), pickupAddress, deliveryAddress, contactName, contactPhone, cargoDescription, incoterm, specialRequirements, readyDate.toISOString(), status),
      ...quoteRows.map(({ id, rate, calculation }: (typeof quoteRows)[number]) => ctx.db.prepare(`
        INSERT INTO quotes (
          id, request_id, rate_id, rate_version, provider_id, base_amount, weight_amount,
          volume_amount, fuel_amount, handling_amount, price, currency, transit_days,
          pricing_snapshot, expires_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        id, requestId, rate.id, rate.version, rate.providerId, calculation.baseAmount,
        calculation.weightAmount, calculation.volumeAmount, calculation.fuelAmount,
        calculation.handlingAmount, calculation.price, rate.currency, rate.transitDays,
        calculation.snapshot, expiresAt,
      )),
      auditStatement(ctx.db, {
        actorUserId: ctx.user.id,
        actorOrganizationId: ctx.membership.organizationId,
        action: "QUOTE_REQUEST_CREATED",
        entityType: "quote_request",
        entityId: requestId,
        after: { origin, destination, loadType, mode, units, weight, volume, cargoItems: validCargoItems ? cargoItems : [], pickupAddress, deliveryAddress, contactName, contactPhone, cargoDescription, incoterm, specialRequirements, readyDate: readyDate.toISOString(), quoteCount: quoteRows.length },
        requestId: ctx.requestId,
      }),
    ];
    await ctx.db.batch(statements);
    return Response.json({ requestId, quoteCount: quoteRows.length }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
