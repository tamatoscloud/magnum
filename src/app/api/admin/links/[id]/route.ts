import { z } from "zod";
import { assertSameOrigin, json, readJson, requirePermission, toErrorResponse } from "@/lib/http";
import { updateLinkExpiry } from "@/server/services/link-service";

const schema = z.object({ expiresAt: z.string().datetime() });

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    assertSameOrigin(request);
    const user = await requirePermission("links:manage");
    const { id } = await context.params;
    const body = schema.parse(await readJson(request));
    await updateLinkExpiry(id, new Date(body.expiresAt), user.id);
    return json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) return json({ error: "Provide an ISO expiry timestamp." }, 400);
    return toErrorResponse(error);
  }
}
