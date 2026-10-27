import { assertSameOrigin, json, requirePermission, toErrorResponse } from "@/lib/http";
import { revokeCampaign } from "@/server/services/campaign-service";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    assertSameOrigin(request);
    const user = await requirePermission("campaigns:revoke");
    const { id } = await context.params;
    await revokeCampaign(id, user.id);
    return json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
