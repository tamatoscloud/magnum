import { writeAudit } from "@/lib/audit/log";
import { prisma } from "@/lib/db/prisma";
import { sweepStaleWorkingDirectories } from "@/lib/pdf/temp-dirs";
import { getEnv } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { csvCell } from "@/lib/csv/evaluate";
import { customerUrl, decryptToken } from "@/lib/security/tokens";
import { createStorage } from "@/lib/storage";
import { enqueueReport } from "@/server/jobs/queues";
import { getRuntimeSettings } from "@/server/services/settings-service";

export async function requestBatchReport(batchId: string, actorId: string): Promise<string> {
  const batch = await prisma.importBatch.findUnique({ where: { id: batchId } });
  if (!batch) throw new AppError("Batch not found.", 404, "not_found");
  const settings = await getRuntimeSettings();
  const created = await prisma.exportFile.create({
    data: {
      batchId,
      storageKey: "pending",
      status: "QUEUED",
      createdById: actorId,
      expiresAt: new Date(Date.now() + settings.exportRetentionHours * 3_600_000),
    },
  });
  await enqueueReport(created.id);
  return created.id;
}

export async function generateBatchReport(exportId: string): Promise<void> {
  const file = await prisma.exportFile.findUnique({ where: { id: exportId } });
  if (!file?.batchId) return;
  const env = getEnv();
  const customers = await prisma.customer.findMany({
    where: { batchId: file.batchId },
    include: {
      document: true,
      accessLinks: { orderBy: { createdAt: "desc" } },
      deliveries: { orderBy: { createdAt: "desc" } },
    },
    orderBy: { rowNumber: "asc" },
  });

  const lines = [
    "customer_name,folio_number,email,phone_number,pdf_filename,processing_status,email_delivery_status,whatsapp_delivery_status,link_expiry,customer_url",
  ];
  for (const customer of customers) {
    const link = customer.accessLinks.find((item) => item.status === "ACTIVE") ?? customer.accessLinks[0];
    let url = "";
    if (link) {
      const raw = decryptToken(link.tokenCiphertext, env.tokenEncryptionKey);
      url = customerUrl(env.APP_BASE_URL, raw);
    }
    lines.push(
      [
        csvCell(customer.customerName),
        csvCell(customer.folioNumber),
        csvCell(customer.email ?? ""),
        csvCell(customer.phoneNumber ?? ""),
        csvCell(customer.sourcePdfFilename),
        customer.document?.processingStatus ?? "PENDING",
        latestStatus(customer.deliveries, "EMAIL"),
        latestStatus(customer.deliveries, "WHATSAPP"),
        link ? link.expiresAt.toISOString() : "",
        csvCell(url),
      ].join(","),
    );
  }

  const storageKey = `exports/${exportId}.csv`;
  await createStorage().putBuffer(storageKey, Buffer.from(`${lines.join("\n")}\n`, "utf8"), "text/csv");
  await prisma.exportFile.update({ where: { id: exportId }, data: { storageKey, status: "READY", errorSummary: null } });
}

function latestStatus(deliveries: Array<{ channel: string; status: string; createdAt: Date }>, channel: string): string {
  const match = deliveries.find((item) => item.channel === channel);
  return match?.status ?? "NOT_QUEUED";
}

export async function runRetentionSweep(): Promise<void> {
  const settings = await getRuntimeSettings();
  const storage = createStorage();
  const now = new Date();
  const exports = await prisma.exportFile.findMany({ where: { expiresAt: { lt: now } }, take: 100 });
  for (const file of exports) {
    if (file.storageKey !== "pending") await storage.delete(file.storageKey).catch(() => undefined);
    await prisma.exportFile.delete({ where: { id: file.id } });
  }

  const originalCutoff = new Date(now.getTime() - settings.originalRetentionDays * 86_400_000);
  const originals = await prisma.document.findMany({
    where: {
      originalDeletedAt: null,
      originalStorageKey: { not: null },
      processingStatus: "ENCRYPTED",
      createdAt: { lt: originalCutoff },
    },
    take: 100,
  });
  for (const document of originals) {
    if (document.originalStorageKey) await storage.delete(document.originalStorageKey).catch(() => undefined);
    await prisma.document.update({ where: { id: document.id }, data: { originalDeletedAt: now, originalStorageKey: null } });
  }

  const encryptedCutoff = new Date(now.getTime() - settings.encryptedRetentionDays * 86_400_000);
  const encrypted = await prisma.document.findMany({
    where: {
      encryptedDeletedAt: null,
      encryptedStorageKey: { not: null },
      createdAt: { lt: encryptedCutoff },
      customer: { accessLinks: { none: { status: "ACTIVE", expiresAt: { gt: now } } } },
    },
    take: 100,
  });
  for (const document of encrypted) {
    if (document.encryptedStorageKey) await storage.delete(document.encryptedStorageKey).catch(() => undefined);
    await prisma.document.update({
      where: { id: document.id },
      data: { encryptedDeletedAt: now, encryptedStorageKey: null },
    });
  }

  const removed = await sweepStaleWorkingDirectories(getEnv().CAMPAIGN_TEMP_MAX_AGE_MINUTES * 60_000, now.getTime());
  if (removed > 0) {
    await writeAudit({
      actorType: "SYSTEM",
      action: "campaign.temp_swept",
      entityType: "ReportCampaign",
      result: "success",
      metadata: { removed },
    });
  }
}
