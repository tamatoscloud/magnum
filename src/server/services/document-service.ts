import type { Prisma } from "@prisma/client";
import { stat } from "node:fs/promises";
import { writeAudit } from "@/lib/audit/log";
import { getEnv } from "@/lib/env";
import { prisma } from "@/lib/db/prisma";
import { encryptPdfFile, pdfPasswordFromFolio, sha256File } from "@/lib/pdf/qpdf";
import { sanitizeErrorMessage } from "@/lib/security/sanitize";
import { addDays, customerUrl, encryptToken, generateToken, hashToken } from "@/lib/security/tokens";
import { createStorage } from "@/lib/storage";
import { extractZipEntry, removeExtractedFile } from "@/lib/zip/inspect";
import { discardWorkingDirectory } from "@/lib/pdf/temp-dirs";
import { downloadKey, refreshBatchCounters } from "@/server/services/batch-service";
import { queueInitialDelivery } from "@/server/services/delivery-service";

export async function encryptCustomerDocument(customerId: string): Promise<void> {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    include: { batch: true, document: true, accessLinks: true },
  });
  if (!customer || customer.batch.status === "CANCELLED") return;
  if (customer.document?.processingStatus === "ENCRYPTED" && customer.document.encryptedStorageKey) {
    await ensureLinkAndDelivery(customer.id);
    await refreshBatchCounters(customer.batchId);
    return;
  }

  const env = getEnv();
  let sourcePath: string | null = null;
  let encryptedDirectory: string | null = null;
  try {
    if (!customer.zipEntryName) throw new Error("No archive entry is assigned to this customer.");
    const zipPath = await downloadKey(customer.batch.zipStorageKey, "statements.zip");
    try {
      sourcePath = await extractZipEntry(zipPath, customer.zipEntryName, env.MAX_UPLOAD_SIZE_MB * 1024 * 1024);
    } finally {
      await removeExtractedFile(zipPath);
    }

    const headerHandle = await import("node:fs/promises").then((fs) => fs.open(sourcePath as string, "r"));
    const header = Buffer.alloc(5);
    await headerHandle.read(header, 0, 5, 0);
    await headerHandle.close();
    if (header.toString("utf8") !== "%PDF-") {
      await recordFailure(customer.id, customer.batchId, "QUARANTINED", "The file is not a PDF.");
      return;
    }

    const originalSha256 = await sha256File(sourcePath);
    const originalStat = await stat(sourcePath);
    const storage = createStorage();
    const originalKey = `batches/${customer.batchId}/original/${customer.id}.pdf`;
    await storage.putFile(originalKey, sourcePath, "application/pdf");

    const userPassword = pdfPasswordFromFolio(customer.normalizedFolioNumber, env.PDF_PASSWORD_POLICY);
    const encrypted = await encryptPdfFile({
      sourcePath,
      userPassword,
      bits: Number(env.PDF_ENCRYPTION_BITS) as 128 | 256,
      qpdfBin: env.QPDF_BIN,
    });
    encryptedDirectory = encrypted.directory;
    const encryptedKey = `batches/${customer.batchId}/encrypted/${customer.id}.pdf`;
    await storage.putFile(encryptedKey, encrypted.outputPath, "application/pdf");

    const expiresAt = addDays(customer.batch.startedAt ?? new Date(), customer.batch.linkExpiryDays);
    await prisma.$transaction(async (tx) => {
      await tx.document.upsert({
        where: { customerId: customer.id },
        create: {
          customerId: customer.id,
          originalStorageKey: originalKey,
          encryptedStorageKey: encryptedKey,
          originalSha256,
          encryptedSha256: encrypted.encryptedSha256,
          fileSizeBytes: Number(originalStat.size),
          encryptedSizeBytes: encrypted.encryptedSize,
          processingStatus: "ENCRYPTED",
          encryptionStatus: "ENCRYPTED",
          failureReason: null,
        },
        update: {
          originalStorageKey: originalKey,
          encryptedStorageKey: encryptedKey,
          originalSha256,
          encryptedSha256: encrypted.encryptedSha256,
          fileSizeBytes: Number(originalStat.size),
          encryptedSizeBytes: encrypted.encryptedSize,
          processingStatus: "ENCRYPTED",
          encryptionStatus: "ENCRYPTED",
          failureReason: null,
        },
      });
      const existing = await tx.accessLink.findFirst({ where: { customerId: customer.id } });
      if (!existing) {
        const rawToken = generateToken();
        await tx.accessLink.create({
          data: {
            customerId: customer.id,
            tokenHash: hashToken(rawToken),
            tokenCiphertext: encryptToken(rawToken, env.tokenEncryptionKey),
            status: "ACTIVE",
            expiresAt,
          },
        });
      }
    });

    await ensureLinkAndDelivery(customer.id);
    await writeAudit({
      actorType: "SYSTEM",
      action: "document.encrypted",
      entityType: "Customer",
      entityId: customer.id,
      result: "success",
      metadata: { encryptedSha256: encrypted.encryptedSha256, bytes: encrypted.encryptedSize },
    });
  } catch (error) {
    const message = sanitizeErrorMessage(error instanceof Error ? error.message : "PDF encryption failed");
    const missingQpdf = error instanceof Error && "code" in error && error.code === "ENOENT";
    await recordFailure(
      customer.id,
      customer.batchId,
      "FAILED",
      missingQpdf ? "qpdf is not installed on the worker." : message,
    );
    if (!missingQpdf) throw error;
  } finally {
    if (sourcePath) await removeExtractedFile(sourcePath);
    if (encryptedDirectory) await discardWorkingDirectory(encryptedDirectory);
    await refreshBatchCounters(customer.batchId);
  }
}

async function ensureLinkAndDelivery(customerId: string): Promise<void> {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    include: { batch: true, accessLinks: { where: { status: "ACTIVE" }, take: 1 } },
  });
  const link = customer?.accessLinks[0];
  if (!customer || !link) return;
  if (customer.batch.notifyEmail && customer.email) {
    await queueInitialDelivery({ customerId, accessLinkId: link.id, channel: "EMAIL" });
  }
  if (customer.batch.notifyWhatsapp && customer.phoneNumber) {
    await queueInitialDelivery({ customerId, accessLinkId: link.id, channel: "WHATSAPP" });
  }
}

async function recordFailure(
  customerId: string,
  batchId: string,
  status: "FAILED" | "QUARANTINED",
  reason: string,
): Promise<void> {
  const data: Prisma.DocumentUpdateInput = {
    processingStatus: status,
    encryptionStatus: status === "QUARANTINED" ? "SKIPPED" : "FAILED",
    failureReason: reason.slice(0, 400),
  };
  await prisma.document.upsert({
    where: { customerId },
    create: {
      customerId,
      processingStatus: status,
      encryptionStatus: status === "QUARANTINED" ? "SKIPPED" : "FAILED",
      failureReason: reason.slice(0, 400),
    },
    update: data,
  });
  await writeAudit({
    actorType: "SYSTEM",
    action: "document.failed",
    entityType: "Customer",
    entityId: customerId,
    result: "failure",
    metadata: { status, reason: reason.slice(0, 180) },
  });
  await refreshBatchCounters(batchId);
}

export function buildCustomerUrl(rawToken: string): string {
  return customerUrl(getEnv().APP_BASE_URL, rawToken);
}
