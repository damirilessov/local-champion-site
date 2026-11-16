import { getRuntimeDb } from "@/db/runtime";
import { auditStatement, errorResponse, getSession, HttpError } from "@/lib/authz";

const companyKinds = new Set(["SHIPPER", "PROVIDER"]);

export async function POST(request: Request) {
  try {
    const session = await getSession(request);
    if (!session) throw new HttpError(401, "Войдите в систему");
    if (session.memberships.length >= 5) throw new HttpError(409, "Достигнут лимит рабочих пространств");
    const payload = await request.json() as { name?: string; kind?: string; profileType?: string; country?: string; businessId?: string; contactName?: string; contactPhone?: string; serviceRegion?: string };
    const name = payload.name?.trim();
    const profileType = payload.kind === "SHIPPER" && payload.profileType === "PERSONAL" ? "PERSONAL" : "BUSINESS";
    if (!name || name.length < 2 || name.length > 120 || !payload.kind || !companyKinds.has(payload.kind)) {
      throw new HttpError(400, "Укажите название и тип компании");
    }
    if (payload.kind === "PROVIDER" && (![payload.country, payload.businessId, payload.contactName, payload.contactPhone, payload.serviceRegion].every((value) => value?.trim().length))) {
      throw new HttpError(400, "Для логистической компании заполните реквизиты, контакт и географию работы");
    }
    const db = await getRuntimeDb();
    const duplicate = await db.prepare(`
      SELECT 1 FROM organization_memberships m JOIN organizations o ON o.id = m.organization_id
      WHERE m.user_id = ? AND lower(o.name) = lower(?) AND o.kind = ? AND o.profile_type = ? AND m.status = 'ACTIVE'
    `).bind(session.user.id, name, payload.kind, profileType).first();
    if (duplicate) throw new HttpError(409, profileType === "PERSONAL" ? "Личный профиль уже добавлен" : "Компания с таким названием уже добавлена");
    const organizationId = crypto.randomUUID();
    const membershipId = crypto.randomUUID();
    const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
    await db.batch([
      db.prepare(`INSERT INTO organizations (id, name, kind, profile_type, country, business_id, contact_name, contact_phone, service_region)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(organizationId, name, payload.kind, profileType, payload.country?.trim() ?? null, payload.businessId?.trim() ?? null, payload.contactName?.trim() ?? null, payload.contactPhone?.trim() ?? null, payload.serviceRegion?.trim() ?? null),
      db.prepare(`
        INSERT INTO organization_memberships (id, organization_id, user_id, role)
        VALUES (?, ?, ?, 'OWNER')
      `).bind(membershipId, organizationId, session.user.id),
      auditStatement(db, {
        actorUserId: session.user.id,
        actorOrganizationId: organizationId,
        action: "ORGANIZATION_CREATED",
        entityType: "organization",
        entityId: organizationId,
        after: { name, kind: payload.kind, profileType, country: payload.country, businessId: payload.businessId, contactName: payload.contactName, contactPhone: payload.contactPhone, serviceRegion: payload.serviceRegion, ownerUserId: session.user.id },
        requestId,
      }),
    ]);
    return Response.json({ organizationId }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
