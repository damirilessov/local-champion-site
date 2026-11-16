import { errorResponse, requireApiContext } from "@/lib/authz";

export async function GET(request: Request) {
  try {
    const ctx = await requireApiContext(request, { roles: ["OWNER", "ADMIN"] });
    const result = await ctx.db.prepare(`
      SELECT a.id, a.action, a.entity_type AS entityType, a.entity_id AS entityId,
        a.before_json AS beforeJson, a.after_json AS afterJson, a.request_id AS requestId,
        a.created_at AS createdAt, u.display_name AS actorName, u.email AS actorEmail
      FROM audit_events a JOIN users u ON u.id = a.actor_user_id
      WHERE a.actor_organization_id = ? ORDER BY a.created_at DESC LIMIT 200
    `).bind(ctx.membership.organizationId).all();
    return Response.json({ events: result.results });
  } catch (error) {
    return errorResponse(error);
  }
}
