import { z } from "zod";
import { assertSameOrigin, json, readJson, requirePermission, toErrorResponse } from "@/lib/http";
import { setAdminActive } from "@/server/services/account-service";

const schema = z.object({ isActive: z.boolean() });

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    assertSameOrigin(request);
    const actor = await requirePermission("users:manage");
    const { id } = await context.params;
    const body = schema.parse(await readJson(request));
    await setAdminActive(id, body.isActive, actor.id);
    return json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) return json({ error: "Choose whether the account is active." }, 400);
    return toErrorResponse(error);
  }
}
