import { assertSameOrigin, json, requirePermission, toErrorResponse } from "@/lib/http";
import { regenerateCampaignToken, revealCampaignUrl } from "@/server/services/campaign-service";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const user = await requirePermission("campaigns:reveal");
    const { id } = await context.params;
    return json({ url: await revealCampaignUrl(id, user.id) });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    assertSameOrigin(request);
    const user = await requirePermission("campaigns:reveal");
    const { id } = await context.params;
    return json({
      url: await regenerateCampaignToken(id, user.id),
      warning: "The previous shared URL no longer works.",
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
