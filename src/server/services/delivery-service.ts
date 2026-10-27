import type { DeliveryChannel, DeliveryStatus } from "@prisma/client";
import { writeAudit } from "@/lib/audit/log";
import { createEmailSender } from "@/lib/email/sender";
import { getEnv } from "@/lib/env";
import { PermanentDeliveryError, TransientDeliveryError } from "@/lib/errors";
import { prisma } from "@/lib/db/prisma";
import { decryptToken, customerUrl, isPast } from "@/lib/security/tokens";
import { sendWhatsApp } from "@/lib/whatsapp/cloud-api";
import { AppError } from "@/lib/errors";
import { enqueueEmail, enqueueWhatsApp } from "@/server/jobs/queues";

export async function queueInitialDelivery(input: {
  customerId: string;
  accessLinkId: string;
  channel: DeliveryChannel;
}): Promise<void> {
  const idempotencyKey = `${input.channel.toLowerCase()}:${input.accessLinkId}:initial`;
  const attempt = await prisma.deliveryAttempt.upsert({
    where: { idempotencyKey },
    create: {
      customerId: input.customerId,
      accessLinkId: input.accessLinkId,
      channel: input.channel,
      status: "QUEUED",
      idempotencyKey,
    },
    update: {},
  });
  if (attempt.status === "QUEUED") {
    if (input.channel === "EMAIL") await enqueueEmail(attempt.id);
    else await enqueueWhatsApp(attempt.id);
  }
}

export async function sendDeliveryAttempt(deliveryAttemptId: string): Promise<void> {
  const attempt = await prisma.deliveryAttempt.findUnique({
    where: { id: deliveryAttemptId },
    include: { customer: { include: { batch: true } }, accessLink: true },
  });
  if (!attempt) return;
  if (attempt.status === "SENT" || attempt.status === "DELIVERED" || attempt.status === "MOCK_RECORDED") return;
  if (attempt.customer.batch.status === "CANCELLED" || attempt.accessLink.status !== "ACTIVE" || isPast(attempt.accessLink.expiresAt)) {
    await prisma.deliveryAttempt.update({
      where: { id: attempt.id },
      data: { status: "FAILED", lastErrorCode: "link_inactive" },
    });
    return;
  }

  const env = getEnv();
  const rawToken = decryptToken(attempt.accessLink.tokenCiphertext, env.tokenEncryptionKey);
  const accessUrl = customerUrl(env.APP_BASE_URL, rawToken);
  await prisma.deliveryAttempt.update({
    where: { id: attempt.id },
    data: { attemptCount: { increment: 1 } },
  });

  try {
    if (attempt.channel === "EMAIL") {
      if (!attempt.customer.email) throw new PermanentDeliveryError("Customer has no email address.", "missing_email");
      const sender = createEmailSender();
      const result = await sender.send({
        to: attempt.customer.email,
        customerName: attempt.customer.customerName,
        accessUrl,
        expiresAt: attempt.accessLink.expiresAt,
        idempotencyKey: attempt.idempotencyKey,
      });
      await markSent(attempt.id, result.mock ? "MOCK_RECORDED" : "SENT", result.providerMessageId, result.mock);
    } else {
      if (!attempt.customer.phoneNumber) throw new PermanentDeliveryError("Customer has no phone number.", "missing_phone");
      const result = await sendWhatsApp({
        to: attempt.customer.phoneNumber,
        customerName: attempt.customer.customerName,
        accessUrl,
        idempotencyKey: attempt.idempotencyKey,
      });
      await markSent(attempt.id, result.mock ? "MOCK_RECORDED" : "SENT", result.providerMessageId, result.mock);
    }
  } catch (error) {
    const code = error instanceof PermanentDeliveryError || error instanceof TransientDeliveryError ? error.code : "send_error";
    await prisma.deliveryAttempt.update({
      where: { id: attempt.id },
      data: { lastErrorCode: code.slice(0, 80), status: error instanceof PermanentDeliveryError ? "FAILED" : attempt.status },
    });
    if (error instanceof PermanentDeliveryError) {
      await writeAudit({
        actorType: "SYSTEM",
        action: "delivery.failed",
        entityType: "DeliveryAttempt",
        entityId: attempt.id,
        result: "failure",
        metadata: { channel: attempt.channel, code },
      });
      return;
    }
    throw error;
  }
}

async function markSent(id: string, status: DeliveryStatus, providerMessageId: string | null, mock: boolean): Promise<void> {
  await prisma.deliveryAttempt.update({
    where: { id },
    data: { status, providerMessageId, isMock: mock, lastErrorCode: null },
  });
  await writeAudit({
    actorType: "SYSTEM",
    action: mock ? "delivery.mock_recorded" : "delivery.sent",
    entityType: "DeliveryAttempt",
    entityId: id,
    result: "success",
    metadata: { status, mock },
  });
}

export async function resendCustomerNotification(customerId: string, channel: DeliveryChannel | "BOTH", actorId: string): Promise<void> {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    include: { accessLinks: { where: { status: "ACTIVE" }, orderBy: { createdAt: "desc" }, take: 1 } },
  });
  if (!customer) throw new AppError("Customer not found.", 404, "not_found");
  const link = customer.accessLinks[0];
  if (!link || link.expiresAt.getTime() <= Date.now()) {
    throw new AppError("An active link is required before notifications can be sent.", 409, "link_inactive");
  }
  const channels: DeliveryChannel[] = channel === "BOTH" ? ["EMAIL", "WHATSAPP"] : [channel];
  for (const item of channels) {
    if (item === "EMAIL" && !customer.email) continue;
    if (item === "WHATSAPP" && !customer.phoneNumber) continue;
    const idempotencyKey = `${item.toLowerCase()}:${link.id}:resend:${Date.now()}`;
    const attempt = await prisma.deliveryAttempt.create({
      data: {
        customerId,
        accessLinkId: link.id,
        channel: item,
        status: "QUEUED",
        idempotencyKey,
      },
    });
    if (item === "EMAIL") await enqueueEmail(attempt.id);
    else await enqueueWhatsApp(attempt.id);
  }
  await writeAudit({
    actorType: "ADMIN",
    actorId,
    action: "delivery.resend",
    entityType: "Customer",
    entityId: customerId,
    result: "success",
    metadata: { channel },
  });
}

export async function applyProviderStatus(input: {
  providerMessageId: string;
  status: "SENT" | "DELIVERED" | "FAILED" | "UNKNOWN";
  errorCode?: string | null;
}): Promise<void> {
  const attempt = await prisma.deliveryAttempt.findFirst({ where: { providerMessageId: input.providerMessageId } });
  if (!attempt || attempt.isMock) return;
  if (attempt.status === "DELIVERED" && input.status !== "FAILED") return;
  await prisma.deliveryAttempt.update({
    where: { id: attempt.id },
    data: {
      status: input.status,
      lastErrorCode: input.errorCode ?? null,
    },
  });
  await writeAudit({
    actorType: "WEBHOOK",
    action: "delivery.status",
    entityType: "DeliveryAttempt",
    entityId: attempt.id,
    result: input.status === "FAILED" ? "failure" : "success",
    metadata: { status: input.status, errorCode: input.errorCode ?? null },
  });
}
