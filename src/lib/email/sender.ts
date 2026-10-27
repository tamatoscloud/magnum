import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import nodemailer from "nodemailer";
import { getEnv } from "@/lib/env";
import { PermanentDeliveryError, TransientDeliveryError } from "@/lib/errors";
import { dividendMessage } from "@/lib/email/templates";

export type EmailMessage = {
  to: string;
  customerName: string;
  accessUrl: string;
  expiresAt: Date;
  idempotencyKey: string;
  subject?: string;
  text?: string;
  html?: string;
};

export type EmailSendResult = {
  providerMessageId: string | null;
  mock: boolean;
};

export type EmailSender = {
  mode: "mock" | "smtp" | "resend";
  send(message: EmailMessage): Promise<EmailSendResult>;
};

export function createEmailSender(): EmailSender {
  const env = getEnv();
  const mockAllowed = env.NODE_ENV !== "production" && (env.MOCK_EMAIL_ENABLED === "true" || env.EMAIL_PROVIDER === "mock");
  if (mockAllowed && (env.EMAIL_PROVIDER === "mock" || env.MOCK_EMAIL_ENABLED === "true")) {
    return {
      mode: "mock",
      async send(message) {
        await mkdir(env.DEV_MAILBOX_PATH, { recursive: true });
        const file = path.join(env.DEV_MAILBOX_PATH, `${message.idempotencyKey.replace(/[^a-zA-Z0-9_-]/g, "_")}.json`);
        await writeFile(
          file,
          JSON.stringify(
            {
              channel: "EMAIL",
              to: message.to,
              customerName: message.customerName,
              accessUrl: message.accessUrl,
              expiresAt: message.expiresAt.toISOString(),
              recordedAt: new Date().toISOString(),
            },
            null,
            2,
          ),
        );
        return { providerMessageId: null, mock: true };
      },
    };
  }

  if (env.EMAIL_PROVIDER === "smtp") {
    return { mode: "smtp", send: sendSmtp };
  }
  if (env.EMAIL_PROVIDER === "resend") {
    return { mode: "resend", send: sendResend };
  }
  throw new PermanentDeliveryError("Email delivery is not configured.", "not_configured");
}

async function sendSmtp(message: EmailMessage): Promise<EmailSendResult> {
  const env = getEnv();
  const content = messageContent(message);
  const transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
  });
  try {
    const info = await transport.sendMail({
      from: env.EMAIL_FROM,
      to: message.to,
      subject: content.subject,
      text: content.text,
      html: content.html,
      headers: { "X-Idempotency-Key": message.idempotencyKey },
    });
    return { providerMessageId: info.messageId ?? null, mock: false };
  } catch (error) {
    throw new TransientDeliveryError(error instanceof Error ? error.message : "SMTP send failed", "smtp_error");
  }
}

async function sendResend(message: EmailMessage): Promise<EmailSendResult> {
  const env = getEnv();
  const content = messageContent(message);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.EMAIL_API_KEY}`,
      "Content-Type": "application/json",
      "Idempotency-Key": message.idempotencyKey,
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: [message.to],
      subject: content.subject,
      html: content.html,
      text: content.text,
    }),
  });
  const body = (await response.json().catch(() => ({}))) as { id?: string; message?: string };
  if (response.status === 429 || response.status >= 500) {
    throw new TransientDeliveryError(body.message ?? "Email provider is unavailable", `http_${response.status}`);
  }
  if (!response.ok) {
    throw new PermanentDeliveryError(body.message ?? "Email provider rejected the message", `http_${response.status}`);
  }
  return { providerMessageId: body.id ?? null, mock: false };
}

function messageContent(message: EmailMessage): { subject: string; text: string; html: string } {
  if (message.subject && message.text && message.html) {
    return { subject: message.subject, text: message.text, html: message.html };
  }
  return dividendMessage(message);
}
