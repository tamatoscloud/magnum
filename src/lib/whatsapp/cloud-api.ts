import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { getEnv } from "@/lib/env";
import { PermanentDeliveryError, TransientDeliveryError } from "@/lib/errors";

export type WhatsAppMessage = {
  to: string;
  customerName: string;
  accessUrl: string;
  idempotencyKey: string;
};

export type WhatsAppSendResult = {
  providerMessageId: string | null;
  mock: boolean;
};

export function whatsAppConfigured(): boolean {
  const env = getEnv();
  return Boolean(env.WHATSAPP_ACCESS_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID);
}

export async function sendWhatsApp(message: WhatsAppMessage): Promise<WhatsAppSendResult> {
  const env = getEnv();
  const mockAllowed = env.NODE_ENV !== "production" && env.MOCK_WHATSAPP_ENABLED === "true";
  if (!whatsAppConfigured()) {
    if (mockAllowed) return recordMock(message);
    throw new PermanentDeliveryError("WhatsApp is not configured.", "not_configured");
  }

  const response = await fetch(
    `https://graph.facebook.com/${env.WHATSAPP_API_VERSION}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: message.to.replace(/^\+/, ""),
        type: "template",
        template: {
          name: env.WHATSAPP_TEMPLATE_NAME,
          language: { code: env.WHATSAPP_TEMPLATE_LANG },
          components: [
            {
              type: "body",
              parameters: [
                { type: "text", text: message.customerName },
                { type: "text", text: message.accessUrl },
              ],
            },
          ],
        },
      }),
    },
  );

  const body = (await response.json().catch(() => ({}))) as {
    messages?: Array<{ id?: string }>;
    error?: { message?: string; code?: number };
  };

  if (response.status === 429 || response.status >= 500) {
    throw new TransientDeliveryError(body.error?.message ?? "WhatsApp is rate limiting requests", `http_${response.status}`);
  }
  if (!response.ok) {
    throw new PermanentDeliveryError(body.error?.message ?? "WhatsApp rejected the template message", `wa_${body.error?.code ?? response.status}`);
  }
  return { providerMessageId: body.messages?.[0]?.id ?? null, mock: false };
}

async function recordMock(message: WhatsAppMessage): Promise<WhatsAppSendResult> {
  const env = getEnv();
  await mkdir(env.DEV_MAILBOX_PATH, { recursive: true });
  const file = path.join(env.DEV_MAILBOX_PATH, `${message.idempotencyKey.replace(/[^a-zA-Z0-9_-]/g, "_")}.json`);
  await writeFile(
    file,
    JSON.stringify(
      {
        channel: "WHATSAPP",
        to: message.to,
        customerName: message.customerName,
        accessUrl: message.accessUrl,
        recordedAt: new Date().toISOString(),
        mode: "mock",
      },
      null,
      2,
    ),
  );
  return { providerMessageId: null, mock: true };
}
