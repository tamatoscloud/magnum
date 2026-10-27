import { assertSameOrigin, json, requirePermission, toErrorResponse } from "@/lib/http";
import { retryDocument } from "@/server/services/batch-service";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    assertSameOrigin(request);
    const user = await requirePermission("documents:retry");
    const { id } = await context.params;
    await retryDocument(id, user.id);
    return json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
