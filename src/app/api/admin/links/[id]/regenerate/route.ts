import { assertSameOrigin, json, requirePermission, toErrorResponse } from "@/lib/http";
import { regenerateLink } from "@/server/services/link-service";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    assertSameOrigin(request);
    const user = await requirePermission("links:manage");
    const { id } = await context.params;
    const link = await regenerateLink(id, user.id);
    return json(link);
  } catch (error) {
    return toErrorResponse(error);
  }
}
