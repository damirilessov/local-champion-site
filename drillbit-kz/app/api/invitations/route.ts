import { auditStatement, errorResponse, HttpError, requireApiContext } from "@/lib/authz";

const inviteRoles = new Set(["ADMIN", "OPERATIONS", "FINANCE", "VIEWER"]);

export async function GET(request: Request) {
  try {
    const ctx = await requireApiContext(request, { roles: ["OWNER", "ADMIN"] });
    const [invitationResult, memberResult] = await Promise.all([
      ctx.db.prepare(`
      SELECT id, email, role, status, expires_at AS expiresAt, created_at AS createdAt
      FROM organization_invitations WHERE organization_id = ? ORDER BY created_at DESC LIMIT 100
      `).bind(ctx.membership.organizationId).all(),
      ctx.db.prepare(`
        SELECT m.id, u.display_name AS displayName, u.email, m.role, m.status,
          m.created_at AS createdAt
        FROM organization_memberships m JOIN users u ON u.id = m.user_id
        WHERE m.organization_id = ? ORDER BY m.created_at ASC
      `).bind(ctx.membership.organizationId).all(),
    ]);
    return Response.json({ invitations: invitationResult.results, members: memberResult.results });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireApiContext(request, { roles: ["OWNER", "ADMIN"] });
    const payload = await request.json() as { email?: string; role?: string };
    const email = payload.email?.trim().toLowerCase();
    if (!email || !/^\S+@\S+\.\S+$/.test(email) || !payload.role || !inviteRoles.has(payload.role)) {
      throw new HttpError(400, "Укажите корректный email и роль");
    }
    const existingMember = await ctx.db.prepare(`
      SELECT 1 FROM organization_memberships m JOIN users u ON u.id = m.user_id
      WHERE m.organization_id = ? AND lower(u.email) = ? AND m.status = 'ACTIVE'
    `).bind(ctx.membership.organizationId, email).first();
    if (existingMember) throw new HttpError(409, "Пользователь уже состоит в компании");
    const invitationId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 7 * 86_400_000).toISOString();
    await ctx.db.batch([
      ctx.db.prepare(`
        UPDATE organization_invitations SET status = 'REVOKED'
        WHERE organization_id = ? AND lower(email) = ? AND status = 'PENDING'
      `).bind(ctx.membership.organizationId, email),
      ctx.db.prepare(`
        INSERT INTO organization_invitations (id, organization_id, email, role, invited_by_user_id, expires_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(invitationId, ctx.membership.organizationId, email, payload.role, ctx.user.id, expiresAt),
      auditStatement(ctx.db, {
        actorUserId: ctx.user.id,
        actorOrganizationId: ctx.membership.organizationId,
        action: "INVITATION_CREATED",
        entityType: "organization_invitation",
        entityId: invitationId,
        after: { email, role: payload.role, expiresAt },
        requestId: ctx.requestId,
      }),
    ]);
    return Response.json({ invitationId, expiresAt }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const ctx = await requireApiContext(request, { roles: ["OWNER", "ADMIN"] });
    const payload = await request.json() as { target?: "INVITATION" | "MEMBER"; id?: string; role?: string };
    if (!payload.id || !payload.target) throw new HttpError(400, "Не выбрана запись команды");
    if (payload.target === "INVITATION") {
      const result = await ctx.db.batch([
        ctx.db.prepare("UPDATE organization_invitations SET status = 'REVOKED' WHERE id = ? AND organization_id = ? AND status = 'PENDING'").bind(payload.id, ctx.membership.organizationId),
        ctx.db.prepare(`INSERT INTO audit_events (id, actor_user_id, actor_organization_id, action, entity_type, entity_id, request_id)
          SELECT ?, ?, ?, 'INVITATION_REVOKED', 'organization_invitation', ?, ? WHERE changes() = 1`
        ).bind(crypto.randomUUID(), ctx.user.id, ctx.membership.organizationId, payload.id, ctx.requestId),
      ]);
      if (result[0].meta.changes !== 1) throw new HttpError(404, "Приглашение уже недоступно");
      return Response.json({ updated: true });
    }
    if (ctx.membership.role !== "OWNER") throw new HttpError(403, "Только владелец меняет роли команды");
    if (!payload.role || !inviteRoles.has(payload.role)) throw new HttpError(400, "Выберите допустимую роль");
    const member = await ctx.db.prepare("SELECT role FROM organization_memberships WHERE id = ? AND organization_id = ? AND status = 'ACTIVE'").bind(payload.id, ctx.membership.organizationId).first<{ role: string }>();
    if (!member) throw new HttpError(404, "Участник не найден");
    if (member.role === "OWNER") throw new HttpError(409, "Сначала передайте владение компанией отдельным действием");
    await ctx.db.batch([
      ctx.db.prepare("UPDATE organization_memberships SET role = ? WHERE id = ? AND organization_id = ?").bind(payload.role, payload.id, ctx.membership.organizationId),
      auditStatement(ctx.db, { actorUserId: ctx.user.id, actorOrganizationId: ctx.membership.organizationId, action: "MEMBERSHIP_ROLE_CHANGED", entityType: "organization_membership", entityId: payload.id, before: { role: member.role }, after: { role: payload.role }, requestId: ctx.requestId }),
    ]);
    return Response.json({ updated: true });
  } catch (error) { return errorResponse(error); }
}
