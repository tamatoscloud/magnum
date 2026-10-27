import { assertSameOrigin, json, requirePermission, toErrorResponse } from "@/lib/http";
import { requestBatchReport } from "@/server/services/report-service";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    assertSameOrigin(request);
    const user = await requirePermission("reports:export");
    const { id } = await context.params;
    const reportId = await requestBatchReport(id, user.id);
    return json({ reportId }, 202);
  } catch (error) {
    return toErrorResponse(error);
  }
}
