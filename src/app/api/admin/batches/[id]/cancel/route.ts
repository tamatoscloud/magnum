import { assertSameOrigin, json, requirePermission, toErrorResponse } from "@/lib/http";
import { cancelBatch } from "@/server/services/batch-service";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    assertSameOrigin(request);
    const user = await requirePermission("batches:cancel");
    const { id } = await context.params;
    await cancelBatch(id, user.id);
    return json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
