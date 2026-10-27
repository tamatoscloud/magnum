import { z } from "zod";
import { assertSameOrigin, json, readJson, requirePermission, toErrorResponse } from "@/lib/http";
import { resendCustomerNotification } from "@/server/services/delivery-service";

const schema = z.object({ channel: z.enum(["EMAIL", "WHATSAPP", "BOTH"]) });

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    assertSameOrigin(request);
    const user = await requirePermission("notifications:resend");
    const { id } = await context.params;
    const body = schema.parse(await readJson(request));
    await resendCustomerNotification(id, body.channel, user.id);
    return json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) return json({ error: "Choose a delivery channel." }, 400);
    return toErrorResponse(error);
  }
}
