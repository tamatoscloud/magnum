import { getEnv } from "@/lib/env";
import { verifyWebhookSignature } from "@/lib/security/webhook";
import { applyProviderStatus } from "@/server/services/delivery-service";

type WhatsAppPayload = {
  entry?: Array<{
    changes?: Array<{
      value?: {
        statuses?: Array<{
          id?: string;
          status?: string;
          errors?: Array<{ code?: number }>;
        }>;
      };
    }>;
  }>;
};

export async function GET(request: Request): Promise<Response> {
  const env = getEnv();
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  if (mode === "subscribe" && env.WHATSAPP_VERIFY_TOKEN && token === env.WHATSAPP_VERIFY_TOKEN && challenge) {
    return new Response(challenge, { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

export async function POST(request: Request): Promise<Response> {
  const env = getEnv();
  const raw = await request.text();
  if (!env.WHATSAPP_APP_SECRET || !verifyWebhookSignature(env.WHATSAPP_APP_SECRET, raw, request.headers.get("x-hub-signature-256"))) {
    return new Response("Invalid signature", { status: 401 });
  }
  let payload: WhatsAppPayload;
  try {
    payload = JSON.parse(raw) as WhatsAppPayload;
  } catch {
    return new Response("Invalid payload", { status: 400 });
  }
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const status of change.value?.statuses ?? []) {
        if (!status.id || !status.status) continue;
        const mapped = mapStatus(status.status);
        if (!mapped) continue;
        await applyProviderStatus({
          providerMessageId: status.id,
          status: mapped,
          errorCode: status.errors?.[0]?.code ? String(status.errors[0].code) : null,
        });
      }
    }
  }
  return new Response("ok");
}

function mapStatus(status: string): "SENT" | "DELIVERED" | "FAILED" | "UNKNOWN" | null {
  if (status === "sent") return "SENT";
  if (status === "delivered" || status === "read") return "DELIVERED";
  if (status === "failed") return "FAILED";
  return "UNKNOWN";
}
