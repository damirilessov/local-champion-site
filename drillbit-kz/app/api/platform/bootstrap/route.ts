import { env } from "cloudflare:workers";
import { getRuntimeDb } from "@/db/runtime";
import { auditStatement, errorResponse, getSession, HttpError } from "@/lib/authz";

export async function POST(request: Request) {
  try {
    const session = await getSession(request);
    if (!session) throw new HttpError(401, "Войдите в систему");
    const configuredToken = (env as unknown as { ATLAS_BOOTSTRAP_TOKEN?: string }).ATLAS_BOOTSTRAP_TOKEN;
    const suppliedToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
    if (!configuredToken || configuredToken.length < 24) {
      throw new HttpError(503, "Bootstrap платформы не настроен");
    }
    if (!suppliedToken || !await equalSecrets(suppliedToken, configuredToken)) {
      throw new HttpError(403, "Неверный bootstrap-токен");
    }
    const db = await getRuntimeDb();
    const platform = await db.prepare("SELECT id FROM organizations WHERE kind = 'PLATFORM' AND status = 'ACTIVE' LIMIT 1").first<{ id: string }>();
    if (!platform) throw new HttpError(409, "Организация платформы не создана");
    const existing = await db.prepare(`
      SELECT id FROM organization_memberships
      WHERE organization_id = ? AND user_id = ? AND status = 'ACTIVE'
    `).bind(platform.id, session.user.id).first<{ id: string }>();
    if (existing) return Response.json({ organizationId: platform.id, membershipId: existing.id });
    const administrator = await db.prepare(`
      SELECT 1 FROM organization_memberships
      WHERE organization_id = ? AND status = 'ACTIVE' AND role IN ('OWNER', 'ADMIN') LIMIT 1
    `).bind(platform.id).first();
    if (administrator) throw new HttpError(409, "Первый администратор уже создан; используйте приглашение");
    const membershipId = crypto.randomUUID();
    const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
    try {
      await db.batch([
        db.prepare(`
          INSERT INTO platform_bootstrap_claims (id, claimed_by_user_id)
          VALUES ('first-platform-owner', ?)
        `).bind(session.user.id),
        db.prepare(`
          INSERT INTO organization_memberships (id, organization_id, user_id, role)
          VALUES (?, ?, ?, 'OWNER')
        `).bind(membershipId, platform.id, session.user.id),
        auditStatement(db, {
          actorUserId: session.user.id,
          actorOrganizationId: platform.id,
          action: "PLATFORM_ADMIN_BOOTSTRAPPED",
          entityType: "organization_membership",
          entityId: membershipId,
          after: { userId: session.user.id, role: "OWNER" },
          requestId,
        }),
      ]);
    } catch (error) {
      const claim = await db.prepare(`
        SELECT claimed_by_user_id AS userId FROM platform_bootstrap_claims
        WHERE id = 'first-platform-owner'
      `).first<{ userId: string }>();
      if (claim && claim.userId !== session.user.id) {
        throw new HttpError(409, "Первый администратор уже создан; используйте приглашение");
      }
      throw error;
    }
    return Response.json({ organizationId: platform.id, membershipId }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

async function equalSecrets(left: string, right: string) {
  const encoder = new TextEncoder();
  const [leftHash, rightHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(left)),
    crypto.subtle.digest("SHA-256", encoder.encode(right)),
  ]);
  const leftBytes = new Uint8Array(leftHash);
  const rightBytes = new Uint8Array(rightHash);
  let difference = leftBytes.length ^ rightBytes.length;
  for (let index = 0; index < Math.max(leftBytes.length, rightBytes.length); index += 1) {
    difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }
  return difference === 0;
}
