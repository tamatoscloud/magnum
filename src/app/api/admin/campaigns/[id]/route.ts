import { json, requirePermission, toErrorResponse } from "@/lib/http";
import { getCampaignDetail } from "@/server/services/campaign-service";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    await requirePermission("campaigns:read");
    const { id } = await context.params;
    return json(await getCampaignDetail(id));
  } catch (error) {
    return toErrorResponse(error);
  }
}
