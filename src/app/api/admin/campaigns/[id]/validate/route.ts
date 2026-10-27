import { assertSameOrigin, json, readJson, requirePermission, toErrorResponse } from "@/lib/http";
import { parseCampaignMapping, validateCampaignCsv } from "@/server/services/campaign-service";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    assertSameOrigin(request);
    const user = await requirePermission("campaigns:create");
    const { id } = await context.params;
    const body = (await readJson(request)) as { mapping?: unknown };
    await validateCampaignCsv(id, parseCampaignMapping(body.mapping), user.id);
    return json({ ok: true });
  } catch (error) {
    if (error instanceof Error && /Map a CSV column/.test(error.message)) return json({ error: error.message }, 400);
    return toErrorResponse(error);
  }
}
