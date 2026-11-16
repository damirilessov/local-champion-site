import { errorResponse, getSession } from "@/lib/authz";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const session = await getSession(request);
    if (!session) return Response.json({ error: "Войдите в систему" }, { status: 401 });
    return Response.json(session);
  } catch (error) {
    return errorResponse(error);
  }
}
