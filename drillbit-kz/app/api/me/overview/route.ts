import { errorResponse, getSession, HttpError } from "@/lib/authz";
import { getRuntimeDb } from "@/db/runtime";

export async function GET(request: Request) {
  try {
    const session = await getSession(request);
    if (!session) throw new HttpError(401, "Войдите в систему");
    const db = await getRuntimeDb();
    const result = await db.prepare(`
      SELECT o.id, o.name, o.kind, o.profile_type AS profileType, m.role,
        CASE WHEN o.kind = 'SHIPPER' THEN (SELECT COUNT(*) FROM quote_requests qr WHERE qr.shipper_id = o.id)
          WHEN o.kind = 'PROVIDER' THEN (SELECT COUNT(*) FROM rates r WHERE r.provider_id = o.id AND r.active = 1)
          ELSE (SELECT COUNT(*) FROM organizations) END AS primaryCount,
        CASE WHEN o.kind = 'SHIPPER' THEN (SELECT COUNT(*) FROM shipments s WHERE s.shipper_id = o.id AND s.status NOT IN ('CLOSED', 'CANCELLED'))
          WHEN o.kind = 'PROVIDER' THEN (SELECT COUNT(*) FROM shipments s WHERE s.provider_id = o.id AND s.status NOT IN ('CLOSED', 'CANCELLED'))
          ELSE (SELECT COUNT(*) FROM shipments s WHERE s.status NOT IN ('CLOSED', 'CANCELLED')) END AS activeShipments,
        CASE WHEN o.kind = 'SHIPPER' THEN (SELECT coalesce(SUM(s.price), 0) FROM shipments s WHERE s.shipper_id = o.id AND s.status != 'CANCELLED')
          WHEN o.kind = 'PROVIDER' THEN (SELECT coalesce(SUM(s.price), 0) FROM shipments s WHERE s.provider_id = o.id AND s.status != 'CANCELLED')
          ELSE (SELECT coalesce(SUM(s.price), 0) FROM shipments s WHERE s.status != 'CANCELLED') END AS volume
      FROM organization_memberships m JOIN organizations o ON o.id = m.organization_id
      WHERE m.user_id = ? AND m.status = 'ACTIVE' AND o.status = 'ACTIVE'
      ORDER BY o.created_at ASC
    `).bind(session.user.id).all();
    return Response.json({ organizations: result.results });
  } catch (error) { return errorResponse(error); }
}
