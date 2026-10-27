import { assertSameOrigin, json, readJson, requirePermission, toErrorResponse } from "@/lib/http";
import { parseMapping, startValidation } from "@/server/services/batch-service";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    assertSameOrigin(request);
    const user = await requirePermission("batches:create");
    const { id } = await context.params;
    const body = (await readJson(request)) as { mapping?: unknown };
    await startValidation(id, parseMapping(body.mapping), user.id);
    return json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
