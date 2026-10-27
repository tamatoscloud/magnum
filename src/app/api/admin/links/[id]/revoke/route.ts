import { assertSameOrigin, json, requirePermission, toErrorResponse } from "@/lib/http";
import { revokeLink } from "@/server/services/link-service";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    assertSameOrigin(request);
    const user = await requirePermission("links:manage");
    const { id } = await context.params;
    await revokeLink(id, user.id);
    return json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
