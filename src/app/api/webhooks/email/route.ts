import { z } from "zod";
import { getEnv } from "@/lib/env";
import { verifyWebhookSignature } from "@/lib/security/webhook";
import { applyProviderStatus } from "@/server/services/delivery-service";

const schema = z.object({
  providerMessageId: z.string().min(1).max(200),
  status: z.enum(["sent", "delivered", "failed", "unknown"]),
  errorCode: z.string().max(80).optional(),
});

export async function POST(request: Request): Promise<Response> {
  const env = getEnv();
  const raw = await request.text();
  if (!env.EMAIL_WEBHOOK_SECRET || !verifyWebhookSignature(env.EMAIL_WEBHOOK_SECRET, raw, request.headers.get("x-magnum-signature"))) {
    return new Response("Invalid signature", { status: 401 });
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response("Invalid payload", { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return new Response("Invalid payload", { status: 400 });
  const statusMap = { sent: "SENT", delivered: "DELIVERED", failed: "FAILED", unknown: "UNKNOWN" } as const;
  await applyProviderStatus({
    providerMessageId: parsed.data.providerMessageId,
    status: statusMap[parsed.data.status],
    errorCode: parsed.data.errorCode ?? null,
  });
  return new Response("ok");
}
