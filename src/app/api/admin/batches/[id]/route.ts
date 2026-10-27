import { json, requirePermission, toErrorResponse } from "@/lib/http";
import { getBatchDetail } from "@/server/repositories/admin-queries";
import { AppError } from "@/lib/errors";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    await requirePermission("batches:read");
    const { id } = await context.params;
    const batch = await getBatchDetail(id);
    if (!batch) throw new AppError("Batch not found.", 404, "not_found");
    return json(batch);
  } catch (error) {
    return toErrorResponse(error);
  }
}
