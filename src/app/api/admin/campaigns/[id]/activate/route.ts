import { assertSameOrigin, json, requirePermission, toErrorResponse } from "@/lib/http";
import { activateCampaign } from "@/server/services/campaign-service";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    assertSameOrigin(request);
    const user = await requirePermission("campaigns:activate");
    const { id } = await context.params;
    await activateCampaign(id, user.id);
    return json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
