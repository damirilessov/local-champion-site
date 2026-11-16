import { env } from "cloudflare:workers";
import { getRuntimeDb } from "@/db/runtime";
import { auditStatement, errorResponse, getSession, HttpError, requireApiContext } from "@/lib/authz";

const allowedTypes = new Set(["application/pdf", "image/png", "image/jpeg"]);

export async function POST(request: Request) {
  try {
    const ctx = await requireApiContext(request, { kinds: ["PROVIDER"], roles: ["OWNER", "ADMIN", "OPERATIONS"] });
    const form = await request.formData();
    const shipmentId = String(form.get("shipmentId") ?? "");
    const file = form.get("file");
    if (!shipmentId || !(file instanceof File)) throw new HttpError(400, "Выберите файл POD");
    if (!allowedTypes.has(file.type) || file.size < 1 || file.size > 10 * 1024 * 1024) throw new HttpError(400, "POD должен быть PDF, PNG или JPEG размером до 10 МБ");
    const shipment = await ctx.db.prepare("SELECT id FROM shipments WHERE id = ? AND provider_id = ?").bind(shipmentId, ctx.membership.organizationId).first();
    if (!shipment) throw new HttpError(404, "Перевозка не найдена");
    const id = crypto.randomUUID();
    const objectKey = `shipments/${shipmentId}/pod/${id}`;
    await env.FILES.put(objectKey, file.stream(), { httpMetadata: { contentType: file.type }, customMetadata: { fileName: file.name } });
    await ctx.db.batch([
      ctx.db.prepare(`INSERT INTO shipment_documents (id, shipment_id, uploaded_by_user_id, uploaded_by_organization_id, kind, file_name, object_key, content_type, size)
        VALUES (?, ?, ?, ?, 'POD', ?, ?, ?, ?)`
      ).bind(id, shipmentId, ctx.user.id, ctx.membership.organizationId, file.name.slice(0, 180), objectKey, file.type, file.size),
      auditStatement(ctx.db, { actorUserId: ctx.user.id, actorOrganizationId: ctx.membership.organizationId, action: "SHIPMENT_DOCUMENT_UPLOADED", entityType: "shipment", entityId: shipmentId, after: { documentId: id, kind: "POD", fileName: file.name, size: file.size }, requestId: ctx.requestId }),
    ]);
    return Response.json({ documentId: id, fileName: file.name }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}

export async function GET(request: Request) {
  try {
    const session = await getSession(request);
    if (!session) throw new HttpError(401, "Войдите в систему");
    const id = new URL(request.url).searchParams.get("id");
    if (!id) throw new HttpError(400, "Не выбран документ");
    const db = await getRuntimeDb();
    const organizationIds = session.memberships.map((item) => item.organizationId);
    if (!organizationIds.length) throw new HttpError(403, "Нет доступа к документу");
    const placeholders = organizationIds.map(() => "?").join(",");
    const document = await db.prepare(`SELECT d.object_key AS objectKey, d.file_name AS fileName, d.content_type AS contentType
      FROM shipment_documents d JOIN shipments s ON s.id = d.shipment_id
      WHERE d.id = ? AND (s.shipper_id IN (${placeholders}) OR s.provider_id IN (${placeholders}))`
    ).bind(id, ...organizationIds, ...organizationIds).first<{ objectKey: string; fileName: string; contentType: string }>();
    if (!document) throw new HttpError(404, "Документ не найден");
    const object = await env.FILES.get(document.objectKey);
    if (!object) throw new HttpError(404, "Файл не найден");
    return new Response(object.body, { headers: { "content-type": document.contentType, "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(document.fileName)}`, "cache-control": "private, no-store" } });
  } catch (error) { return errorResponse(error); }
}
