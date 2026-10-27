import { z } from "zod";
import { assertSameOrigin, json, readJson, requirePermission, toErrorResponse } from "@/lib/http";
import { createCampaign, listCampaigns } from "@/server/services/campaign-service";
import { getRuntimeSettings } from "@/server/services/settings-service";

const createSchema = z.object({
  name: z.string().trim().min(3).max(120),
  linkExpiryDays: z.coerce.number().int().positive().max(3650).optional(),
});

export async function GET(request: Request): Promise<Response> {
  try {
    await requirePermission("campaigns:read");
    const page = Number(new URL(request.url).searchParams.get("page") ?? "1");
    return json(await listCampaigns(Number.isFinite(page) && page > 0 ? Math.floor(page) : 1));
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    assertSameOrigin(request);
    const user = await requirePermission("campaigns:create");
    const parsed = createSchema.parse(await readJson(request));
    const settings = await getRuntimeSettings();
    const created = await createCampaign({
      name: parsed.name,
      linkExpiryDays: parsed.linkExpiryDays ?? settings.defaultLinkExpiryDays,
      createdById: user.id,
    });
    return json(created, 201);
  } catch (error) {
    if (error instanceof z.ZodError) return json({ error: "Enter a campaign name." }, 400);
    return toErrorResponse(error);
  }
}
