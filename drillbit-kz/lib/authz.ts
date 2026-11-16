import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getRuntimeDb } from "@/db/runtime";

export type OrganizationKind = "SHIPPER" | "PROVIDER" | "PLATFORM";
export type MembershipRole = "OWNER" | "ADMIN" | "OPERATIONS" | "FINANCE" | "VIEWER";

export type Membership = {
  id: string;
  organizationId: string;
  organizationName: string;
  organizationKind: OrganizationKind;
  organizationProfileType: "BUSINESS" | "PERSONAL";
  role: MembershipRole;
};

export type ApiContext = {
  db: D1Database;
  user: { id: string; email: string; displayName: string };
  membership: Membership;
  requestId: string;
};

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function getSession(request: Request) {
  const identity = await getChatGPTUser();
  if (!identity) return null;
  const db = await getRuntimeDb();
  const email = identity.email.trim().toLowerCase();

  await db.prepare(`
    INSERT INTO users (id, email, display_name, last_seen_at)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET email = excluded.email, display_name = excluded.display_name, last_seen_at = CURRENT_TIMESTAMP
  `).bind(identity.userId, email, identity.displayName).run();
  const storedUser = await db.prepare("SELECT status FROM users WHERE id = ?").bind(identity.userId).first<{ status: string }>();
  if (!storedUser || storedUser.status !== "ACTIVE") throw new HttpError(403, "Учётная запись приостановлена");

  const invitations = await db.prepare(`
    SELECT i.id, i.organization_id AS organizationId, o.name AS organizationName,
      o.kind AS organizationKind, i.role, i.expires_at AS expiresAt
    FROM organization_invitations i JOIN organizations o ON o.id = i.organization_id
    WHERE lower(i.email) = ? AND i.status = 'PENDING' AND julianday(i.expires_at) > julianday('now')
  `).bind(email).all<{ id: string; organizationId: string; organizationName: string; organizationKind: OrganizationKind; role: MembershipRole; expiresAt: string }>();

  const membershipRows = await db.prepare(`
    SELECT m.id, m.organization_id AS organizationId, o.name AS organizationName,
      o.kind AS organizationKind, o.profile_type AS organizationProfileType, m.role
    FROM organization_memberships m
    JOIN organizations o ON o.id = m.organization_id
    WHERE m.user_id = ? AND m.status = 'ACTIVE' AND o.status = 'ACTIVE'
    ORDER BY CASE m.role WHEN 'OWNER' THEN 0 WHEN 'ADMIN' THEN 1 ELSE 2 END, m.created_at
  `).bind(identity.userId).all<Membership>();

  const requestedOrganizationId = request.headers.get("x-organization-id");
  const membership = requestedOrganizationId
    ? membershipRows.results.find((item: Membership) => item.organizationId === requestedOrganizationId)
    : membershipRows.results[0];

  return {
    user: { id: identity.userId, email, displayName: identity.displayName },
    memberships: membershipRows.results,
    membership: membership ?? null,
    pendingInvitations: invitations.results,
  };
}

export async function requireApiContext(
  request: Request,
  options: { kinds?: OrganizationKind[]; roles?: MembershipRole[] } = {},
): Promise<ApiContext> {
  const session = await getSession(request);
  if (!session) throw new HttpError(401, "Войдите в систему");
  if (!session.membership) throw new HttpError(403, "Сначала создайте компанию или примите приглашение");
  if (options.kinds && !options.kinds.includes(session.membership.organizationKind)) {
    throw new HttpError(403, "Недостаточно прав для этого кабинета");
  }
  if (options.roles && !options.roles.includes(session.membership.role)) {
    throw new HttpError(403, "Недостаточно прав для этого действия");
  }
  return {
    db: await getRuntimeDb(),
    user: session.user,
    membership: session.membership,
    requestId: requestId(request),
  };
}

export function errorResponse(error: unknown) {
  if (error instanceof HttpError) return Response.json({ error: error.message }, { status: error.status });
  console.error("Champion Freights request failed", error);
  return Response.json({ error: "Внутренняя ошибка" }, { status: 500 });
}

export function auditStatement(db: D1Database, event: {
  actorUserId: string;
  actorOrganizationId?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  requestId: string;
}) {
  return db.prepare(`
    INSERT INTO audit_events (
      id, actor_user_id, actor_organization_id, action, entity_type, entity_id,
      before_json, after_json, request_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    crypto.randomUUID(), event.actorUserId, event.actorOrganizationId ?? null,
    event.action, event.entityType, event.entityId,
    event.before === undefined ? null : JSON.stringify(event.before),
    event.after === undefined ? null : JSON.stringify(event.after), event.requestId,
  );
}

function requestId(request: Request) {
  return request.headers.get("x-request-id") ?? request.headers.get("cf-ray") ?? crypto.randomUUID();
}
