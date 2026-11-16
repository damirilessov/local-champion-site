import { getRuntimeDb } from "@/db/runtime";
import { errorResponse, getSession, HttpError } from "@/lib/authz";

export async function POST(request: Request) {
  try {
    const session = await getSession(request);
    if (!session) throw new HttpError(401, "Войдите в систему");
    const payload = await request.json() as { invitationId?: string; action?: "ACCEPT" | "DECLINE" };
    if (!payload.invitationId || !["ACCEPT", "DECLINE"].includes(payload.action ?? "")) throw new HttpError(400, "Некорректный ответ на приглашение");
    const db = await getRuntimeDb();
    const invitation = session.pendingInvitations.find((item) => item.id === payload.invitationId);
    if (!invitation) {
      const existing = await db.prepare("SELECT status FROM organization_invitations WHERE id = ? AND lower(email) = ?").bind(payload.invitationId, session.user.email.toLowerCase()).first<{ status: string }>();
      if (existing) throw new HttpError(409, "На приглашение уже ответили");
      throw new HttpError(404, "Приглашение недоступно или истекло");
    }
    if (payload.action === "DECLINE") {
      const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
      const result = await db.batch([
        db.prepare("UPDATE organization_invitations SET status = 'DECLINED' WHERE id = ? AND status = 'PENDING'").bind(invitation.id),
        db.prepare(`INSERT INTO audit_events (id, actor_user_id, actor_organization_id, action, entity_type, entity_id, after_json, request_id)
          SELECT ?, ?, ?, 'INVITATION_DECLINED', 'organization_invitation', ?, ?, ? WHERE changes() = 1`
        ).bind(crypto.randomUUID(), session.user.id, invitation.organizationId, invitation.id, JSON.stringify({ userId: session.user.id }), requestId),
      ]);
      if (result[0].meta.changes !== 1) throw new HttpError(409, "На приглашение уже ответили");
      return Response.json({ declined: true });
    }
    const membershipId = crypto.randomUUID();
    const result = await db.batch([
      db.prepare("INSERT OR IGNORE INTO organization_memberships (id, organization_id, user_id, role) VALUES (?, ?, ?, ?)").bind(membershipId, invitation.organizationId, session.user.id, invitation.role),
      db.prepare("UPDATE organization_invitations SET status = 'ACCEPTED', accepted_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'PENDING'").bind(invitation.id),
      db.prepare(`INSERT INTO audit_events (id, actor_user_id, actor_organization_id, action, entity_type, entity_id, after_json, request_id)
        SELECT ?, ?, ?, 'INVITATION_ACCEPTED', 'organization_invitation', ?, ?, ? WHERE changes() = 1`
      ).bind(crypto.randomUUID(), session.user.id, invitation.organizationId, invitation.id, JSON.stringify({ userId: session.user.id, role: invitation.role }), request.headers.get("x-request-id") ?? crypto.randomUUID()),
    ]);
    if (result[1].meta.changes !== 1) throw new HttpError(409, "На приглашение уже ответили");
    return Response.json({ organizationId: invitation.organizationId }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}
