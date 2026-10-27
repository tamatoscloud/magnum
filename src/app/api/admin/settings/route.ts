import { z } from "zod";
import { assertSameOrigin, json, readJson, requirePermission, toErrorResponse } from "@/lib/http";
import { getRuntimeSettings, providerStatus, updateRuntimeSettings } from "@/server/services/settings-service";
import { writeAudit } from "@/lib/audit/log";

const schema = z.object({
  defaultLinkExpiryDays: z.number().int().positive().max(3650),
  maxUploadSizeMb: z.number().positive().max(10240),
  originalRetentionDays: z.number().int().positive().max(3650),
  encryptedRetentionDays: z.number().int().positive().max(3650),
  exportRetentionHours: z.number().int().positive().max(168),
  notifyEmailDefault: z.boolean(),
  notifyWhatsappDefault: z.boolean(),
});

export async function GET(): Promise<Response> {
  try {
    await requirePermission("settings:read");
    return json({ settings: await getRuntimeSettings(), providers: providerStatus() });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function PUT(request: Request): Promise<Response> {
  try {
    assertSameOrigin(request);
    const user = await requirePermission("settings:write");
    const body = schema.parse(await readJson(request));
    const settings = await updateRuntimeSettings(body, user.id);
    await writeAudit({
      actorType: "ADMIN",
      actorId: user.id,
      action: "settings.updated",
      entityType: "AppSetting",
      entityId: "runtime",
      result: "success",
    });
    return json({ settings, providers: providerStatus() });
  } catch (error) {
    if (error instanceof z.ZodError) return json({ error: "Check the settings values." }, 400);
    return toErrorResponse(error);
  }
}
