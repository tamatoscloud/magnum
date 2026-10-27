import { createWriteStream } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ImportBatch, Prisma } from "@prisma/client";
import Busboy from "busboy";
import { writeAudit } from "@/lib/audit/log";
import {
  assertMapping,
  evaluateImport,
  mapRecords,
  suggestMapping,
  type ColumnMapping,
} from "@/lib/csv/evaluate";
import { decodeCsvBuffer, parseCsvContent } from "@/lib/csv/parse";
import { getEnv } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { createStorage } from "@/lib/storage";
import { readPdfMagic, inspectZip, removeExtractedFile } from "@/lib/zip/inspect";
import { prisma } from "@/lib/db/prisma";
import { enqueuePrepare, enqueueValidation } from "@/server/jobs/queues";
import { getRuntimeSettings } from "@/server/services/settings-service";

const mappingSchemaFields = ["customer_name", "folio_number", "email", "phone_number", "pdf_filename"] as const;

export type UploadedBatchInput = {
  batchName: string;
  linkExpiryDays: number;
  notifyEmail: boolean;
  notifyWhatsapp: boolean;
  csvPath: string;
  csvFilename: string;
  zipPath: string;
  zipFilename: string;
  createdById: string;
};

export async function createUploadedBatch(input: UploadedBatchInput): Promise<{ id: string; headers: string[]; suggestedMapping: Partial<ColumnMapping> }> {
  const csvBuffer = await readFile(input.csvPath);
  const table = parseCsvContent(decodeCsvBuffer(csvBuffer));
  const settings = await getRuntimeSettings();
  const expiry = input.linkExpiryDays || settings.defaultLinkExpiryDays;
  const batch = await prisma.importBatch.create({
    data: {
      batchName: input.batchName,
      status: "UPLOADED",
      originalCsvFilename: input.csvFilename,
      originalZipFilename: input.zipFilename,
      csvStorageKey: "pending",
      zipStorageKey: "pending",
      linkExpiryDays: expiry,
      notifyEmail: input.notifyEmail,
      notifyWhatsapp: input.notifyWhatsapp,
      createdById: input.createdById,
    },
  });

  const storage = createStorage();
  const csvKey = `batches/${batch.id}/source/customers.csv`;
  const zipKey = `batches/${batch.id}/source/statements.zip`;
  try {
    await storage.putFile(csvKey, input.csvPath, "text/csv");
    await storage.putFile(zipKey, input.zipPath, "application/zip");
    await prisma.importBatch.update({
      where: { id: batch.id },
      data: { csvStorageKey: csvKey, zipStorageKey: zipKey },
    });
  } catch (error) {
    await prisma.importBatch.update({
      where: { id: batch.id },
      data: { status: "FAILED", errorSummary: "Upload could not be stored.", completedAt: new Date() },
    });
    throw error;
  }

  await writeAudit({
    actorType: "ADMIN",
    actorId: input.createdById,
    action: "batch.uploaded",
    entityType: "ImportBatch",
    entityId: batch.id,
    result: "success",
    metadata: { batchName: input.batchName, csvFilename: input.csvFilename, zipFilename: input.zipFilename },
  });

  return { id: batch.id, headers: table.headers, suggestedMapping: suggestMapping(table.headers) };
}

export async function startValidation(batchId: string, mapping: ColumnMapping, actorId: string): Promise<void> {
  const batch = await requireBatch(batchId);
  if (!["UPLOADED", "READY", "FAILED"].includes(batch.status)) {
    throw new AppError("This batch can no longer be validated.", 409, "invalid_state");
  }
  const customers = await prisma.customer.count({ where: { batchId } });
  if (customers > 0) throw new AppError("Validation cannot be repeated after customers were created.", 409, "invalid_state");

  const stored = await readStoredCsv(batch);
  assertMapping(stored.headers, mapping);
  await prisma.importBatch.update({
    where: { id: batchId },
    data: { columnMapping: mapping, status: "UPLOADED", errorSummary: null },
  });
  await enqueueValidation(batchId);
  await writeAudit({
    actorType: "ADMIN",
    actorId,
    action: "batch.validation_queued",
    entityType: "ImportBatch",
    entityId: batchId,
    result: "success",
  });
}

export async function validateBatch(batchId: string): Promise<void> {
  const batch = await prisma.importBatch.findUnique({ where: { id: batchId } });
  if (!batch || batch.status === "CANCELLED") return;
  if (!batch.columnMapping) throw new Error("Column mapping is missing.");
  await prisma.importBatch.update({ where: { id: batchId }, data: { status: "VALIDATING", errorSummary: null } });

  const env = getEnv();
  const limits = {
    maxEntries: env.MAX_ZIP_ENTRIES,
    maxUncompressedBytes: env.MAX_UNCOMPRESSED_MB * 1024 * 1024,
    maxCompressionRatio: env.MAX_COMPRESSION_RATIO,
    maxEntryBytes: env.MAX_UPLOAD_SIZE_MB * 1024 * 1024,
  };

  let zipPath: string | null = null;
  try {
    const table = await readStoredCsv(batch);
    const mapping = assertMapping(table.headers, batch.columnMapping as Partial<ColumnMapping>);
    const mapped = mapRecords(table.records, mapping);
    zipPath = await downloadKey(batch.zipStorageKey, "statements.zip");
    const inspection = await inspectZip(zipPath, limits);
    const evaluation = evaluateImport(mapped, { phoneRegion: env.DEFAULT_PHONE_REGION, entries: inspection.entries });
    const entryNames = evaluation.rows.flatMap((row) => (row.zipEntryName ? [row.zipEntryName] : []));
    const magic = await readPdfMagic(zipPath, entryNames, limits.maxEntryBytes);
    for (const row of evaluation.rows) {
      if (!row.isValid || !row.zipEntryName) continue;
      if (magic.get(row.zipEntryName) !== true) {
        row.isValid = false;
        evaluation.issues.push({
          rowNumber: row.rowNumber,
          field: "pdf_filename",
          code: "INVALID_PDF",
          message: "The matched file is not a PDF.",
          severity: "ERROR",
        });
      }
    }

    if (env.FOLIO_GLOBALLY_UNIQUE === "true") {
      await applyGlobalFolioRule(batchId, evaluation.rows, evaluation.issues);
    }

    const validRecords = evaluation.rows.filter((row) => row.isValid).length;
    const invalidRecords = evaluation.rows.length - validRecords;
    const blocking = evaluation.issues.filter((issue) => issue.severity === "ERROR").length;

    await prisma.$transaction(async (tx) => {
      await tx.validationIssue.deleteMany({ where: { batchId } });
      await tx.importRow.deleteMany({ where: { batchId } });
      for (const chunk of chunks(evaluation.rows, 500)) {
        if (chunk.length === 0) continue;
        await tx.importRow.createMany({
          data: chunk.map((row) => ({
            batchId,
            rowNumber: row.rowNumber,
            customerName: row.customerName,
            normalizedCustomerName: row.normalizedCustomerName,
            folioNumber: row.folioNumber,
            normalizedFolioNumber: row.normalizedFolioNumber,
            email: row.email,
            phoneNumber: row.phoneNumber,
            sourcePdfFilename: row.sourcePdfFilename,
            zipEntryName: row.zipEntryName,
            isValid: row.isValid,
          })),
        });
      }
      for (const chunk of chunks(evaluation.issues, 500)) {
        if (chunk.length === 0) continue;
        await tx.validationIssue.createMany({
          data: chunk.map((issue) => ({
            batchId,
            rowNumber: issue.rowNumber,
            field: issue.field,
            code: issue.code,
            message: issue.message,
            severity: issue.severity,
          })),
        });
      }
      await tx.importBatch.update({
        where: { id: batchId },
        data: {
          status: validRecords > 0 ? "READY" : "FAILED",
          totalRecords: evaluation.totalRecords,
          validRecords,
          invalidRecords,
          errorSummary: validRecords > 0 ? null : "No valid customer records remained after validation.",
          completedAt: validRecords > 0 ? null : new Date(),
        },
      });
    });

    await writeAudit({
      actorType: "SYSTEM",
      action: "batch.validated",
      entityType: "ImportBatch",
      entityId: batchId,
      result: validRecords > 0 ? "success" : "failure",
      metadata: { validRecords, invalidRecords, blockingIssues: blocking },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Validation failed";
    await prisma.importBatch.update({
      where: { id: batchId },
      data: { status: "FAILED", errorSummary: message.slice(0, 500), completedAt: new Date() },
    });
    throw error;
  } finally {
    if (zipPath) await removeExtractedFile(zipPath);
  }
}

export async function requestProcessing(batchId: string, actorId: string): Promise<void> {
  const updated = await prisma.importBatch.updateMany({
    where: { id: batchId, status: "READY", validRecords: { gt: 0 } },
    data: { status: "PROCESSING", startedAt: new Date(), errorSummary: null },
  });
  if (updated.count !== 1) throw new AppError("Only a ready batch with valid records can be processed.", 409, "invalid_state");
  await enqueuePrepare(batchId);
  await writeAudit({
    actorType: "ADMIN",
    actorId,
    action: "batch.processing_queued",
    entityType: "ImportBatch",
    entityId: batchId,
    result: "success",
  });
}

export async function prepareBatch(batchId: string): Promise<void> {
  const batch = await prisma.importBatch.findUnique({ where: { id: batchId } });
  if (!batch || batch.status === "CANCELLED") return;
  if (batch.status !== "PROCESSING") return;
  const rows = await prisma.importRow.findMany({ where: { batchId, isValid: true }, orderBy: { rowNumber: "asc" } });
  for (const chunk of chunks(rows, 100)) {
    await prisma.$transaction(async (tx) => {
      for (const row of chunk) {
        await tx.customer.upsert({
          where: { batchId_normalizedFolioNumber: { batchId, normalizedFolioNumber: row.normalizedFolioNumber } },
          create: {
            batchId,
            customerName: row.customerName,
            normalizedCustomerName: row.normalizedCustomerName,
            folioNumber: row.folioNumber,
            normalizedFolioNumber: row.normalizedFolioNumber,
            email: row.email,
            phoneNumber: row.phoneNumber,
            sourcePdfFilename: row.sourcePdfFilename,
            zipEntryName: row.zipEntryName,
            rowNumber: row.rowNumber,
          },
          update: {},
        });
      }
    });
  }

  const customers = await prisma.customer.findMany({ where: { batchId }, select: { id: true } });
  if (customers.length === 0) {
    await prisma.importBatch.update({
      where: { id: batchId },
      data: { status: "FAILED", errorSummary: "No valid records were available to process.", completedAt: new Date() },
    });
    return;
  }
  const { enqueueEncryption } = await import("@/server/jobs/queues");
  const generation = String(Date.now());
  for (const customer of customers) {
    await enqueueEncryption(customer.id, generation);
  }
}

export async function cancelBatch(batchId: string, actorId: string): Promise<void> {
  const updated = await prisma.importBatch.updateMany({
    where: { id: batchId, status: { in: ["UPLOADED", "VALIDATING", "READY", "PROCESSING"] } },
    data: { status: "CANCELLED", completedAt: new Date() },
  });
  if (updated.count !== 1) throw new AppError("This batch cannot be cancelled.", 409, "invalid_state");
  await writeAudit({
    actorType: "ADMIN",
    actorId,
    action: "batch.cancelled",
    entityType: "ImportBatch",
    entityId: batchId,
    result: "success",
  });
}

export async function retryFailedDocuments(batchId: string, actorId: string): Promise<number> {
  const batch = await requireBatch(batchId);
  if (batch.status === "CANCELLED") throw new AppError("Cancelled batches cannot be retried.", 409, "invalid_state");
  const failed = await prisma.document.findMany({
    where: { customer: { batchId }, processingStatus: { in: ["FAILED", "QUARANTINED"] } },
    select: { id: true, customerId: true },
  });
  if (failed.length === 0) return 0;
  await prisma.importBatch.update({
    where: { id: batchId },
    data: { status: "PROCESSING", completedAt: null, errorSummary: null },
  });
  const { enqueueEncryption } = await import("@/server/jobs/queues");
  for (const document of failed) {
    await prisma.document.update({
      where: { id: document.id },
      data: { processingStatus: "PENDING", encryptionStatus: "PENDING", failureReason: null },
    });
    await enqueueEncryption(document.customerId, `retry-${document.id}-${Date.now()}`);
  }
  await writeAudit({
    actorType: "ADMIN",
    actorId,
    action: "batch.retry_failed",
    entityType: "ImportBatch",
    entityId: batchId,
    result: "success",
    metadata: { documents: failed.length },
  });
  return failed.length;
}

export async function retryDocument(documentId: string, actorId: string): Promise<void> {
  const document = await prisma.document.findUnique({ where: { id: documentId }, include: { customer: { include: { batch: true } } } });
  if (!document) throw new AppError("Document not found.", 404, "not_found");
  if (document.customer.batch.status === "CANCELLED") throw new AppError("Cancelled batches cannot be retried.", 409, "invalid_state");
  if (document.processingStatus !== "FAILED" && document.processingStatus !== "QUARANTINED") {
    throw new AppError("Only failed documents can be retried.", 409, "invalid_state");
  }
  await prisma.document.update({
    where: { id: document.id },
    data: { processingStatus: "PENDING", encryptionStatus: "PENDING", failureReason: null },
  });
  await prisma.importBatch.update({
    where: { id: document.customer.batchId },
    data: { status: "PROCESSING", completedAt: null },
  });
  const { enqueueEncryption } = await import("@/server/jobs/queues");
  await enqueueEncryption(document.customerId, `retry-${document.id}-${Date.now()}`);
  await writeAudit({
    actorType: "ADMIN",
    actorId,
    action: "document.retry",
    entityType: "Document",
    entityId: document.id,
    result: "success",
  });
}

export async function refreshBatchCounters(batchId: string): Promise<void> {
  const batch = await prisma.importBatch.findUnique({ where: { id: batchId } });
  if (!batch || batch.status === "CANCELLED") return;
  const total = await prisma.customer.count({ where: { batchId } });
  const grouped = await prisma.document.groupBy({
    by: ["processingStatus"],
    where: { customer: { batchId } },
    _count: { _all: true },
  });
  const counts = Object.fromEntries(grouped.map((row) => [row.processingStatus, row._count._all]));
  const encrypted = counts.ENCRYPTED ?? 0;
  const failed = (counts.FAILED ?? 0) + (counts.QUARANTINED ?? 0);
  const finished = encrypted + failed;
  const data: Prisma.ImportBatchUpdateInput = {
    processedRecords: encrypted,
    failedRecords: failed,
  };
  const active = batch.status === "PROCESSING" || batch.status === "COMPLETED" || batch.status === "COMPLETED_WITH_ERRORS";
  if (active && total > 0 && finished >= total) {
    data.status = failed > 0 ? "COMPLETED_WITH_ERRORS" : "COMPLETED";
    data.completedAt = batch.completedAt ?? new Date();
  } else if (active && finished < total) {
    data.status = "PROCESSING";
    data.completedAt = null;
  }
  await prisma.importBatch.update({ where: { id: batchId }, data });
}

async function applyGlobalFolioRule(
  batchId: string,
  rows: Array<{ isValid: boolean; normalizedFolioNumber: string; rowNumber: number }>,
  issues: Array<{ rowNumber: number | null; field: string | null; code: string; message: string; severity: "ERROR" | "WARNING" }>,
): Promise<void> {
  const folios = rows.filter((row) => row.isValid).map((row) => row.normalizedFolioNumber);
  const taken = new Set<string>();
  for (const chunk of chunks(folios, 500)) {
    const existing = await prisma.customer.findMany({
      where: {
        normalizedFolioNumber: { in: chunk },
        batch: { id: { not: batchId }, status: { notIn: ["CANCELLED", "FAILED"] } },
      },
      select: { normalizedFolioNumber: true },
    });
    for (const row of existing) taken.add(row.normalizedFolioNumber);
  }
  for (const row of rows) {
    if (row.isValid && taken.has(row.normalizedFolioNumber)) {
      row.isValid = false;
      issues.push({
        rowNumber: row.rowNumber,
        field: "folio_number",
        code: "DUPLICATE_FOLIO",
        message: "Folio number is already used by another active batch.",
        severity: "ERROR",
      });
    }
  }
}

async function readStoredCsv(batch: ImportBatch) {
  const storage = createStorage();
  const stream = await storage.open(batch.csvStorageKey);
  const buffer = await streamToBuffer(stream);
  return parseCsvContent(decodeCsvBuffer(buffer));
}

export async function downloadKey(key: string, filename: string): Promise<string> {
  const storage = createStorage();
  const directory = await mkdtemp(path.join(tmpdir(), "magnum-object-"));
  const destination = path.join(directory, filename);
  await pipeline(await storage.open(key), createWriteStream(destination));
  return destination;
}

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function chunks<T>(items: T[], size: number): T[][] {
  const output: T[][] = [];
  for (let index = 0; index < items.length; index += size) output.push(items.slice(index, index + size));
  return output;
}

async function requireBatch(id: string): Promise<ImportBatch> {
  const batch = await prisma.importBatch.findUnique({ where: { id } });
  if (!batch) throw new AppError("Batch not found.", 404, "not_found");
  return batch;
}

export function parseMapping(input: unknown): ColumnMapping {
  if (!input || typeof input !== "object") throw new AppError("Column mapping is required.", 400, "invalid_mapping");
  const record = input as Record<string, unknown>;
  const mapping: Partial<ColumnMapping> = {};
  for (const field of mappingSchemaFields) {
    const value = record[field];
    if (typeof value !== "string" || value.trim() === "") {
      throw new AppError(`Choose a column for ${field}.`, 400, "invalid_mapping");
    }
    mapping[field] = value;
  }
  return mapping as ColumnMapping;
}

export type MultipartUpload = {
  fields: Record<string, string>;
  files: Record<string, { path: string; filename: string; size: number; prefix: Buffer }>;
};

export async function parseMultipartUpload(request: Request, maxBytes: number): Promise<MultipartUpload> {
  const contentType = request.headers.get("content-type");
  if (!contentType?.toLowerCase().includes("multipart/form-data") || !request.body) {
    throw new AppError("Upload a CSV file and a ZIP archive.", 400, "invalid_upload");
  }
  const directory = await mkdtemp(path.join(tmpdir(), "magnum-upload-"));
  const busboy = Busboy({
    headers: { "content-type": contentType },
    limits: { files: 2, fileSize: maxBytes, fields: 12, parts: 8, fieldSize: 20_000 },
  });
  const fields: Record<string, string> = {};
  const files: MultipartUpload["files"] = {};
  const writes: Array<Promise<void>> = [];
  let tooLarge = false;

  const completed = new Promise<void>((resolve, reject) => {
    busboy.on("field", (name: string, value: string) => {
      fields[name] = value;
    });
    busboy.on("file", (name: string, stream: Readable, info: { filename: string }) => {
      const filename = path.basename(info.filename || "upload");
      const destination = path.join(directory, `${name}-${Date.now()}`);
      const prefix: Buffer[] = [];
      let size = 0;
      stream.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (Buffer.concat(prefix).length < 8) prefix.push(chunk);
      });
      stream.on("limit", () => {
        tooLarge = true;
        stream.destroy();
      });
      const writer = createWriteStream(destination);
      writes.push(
        pipeline(stream, writer).then(() => {
          files[name] = { path: destination, filename, size, prefix: Buffer.concat(prefix).subarray(0, 8) };
        }),
      );
    });
    busboy.on("error", reject);
    busboy.on("finish", () => {
      Promise.all(writes).then(() => resolve()).catch(reject);
    });
  });

  const nodeStream = Readable.fromWeb(request.body as import("node:stream/web").ReadableStream);
  nodeStream.pipe(busboy);
  try {
    await completed;
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
  if (tooLarge) {
    await rm(directory, { recursive: true, force: true });
    throw new AppError("A file exceeds the configured upload size.", 413, "upload_too_large");
  }
  return { fields, files };
}

export async function discardUpload(upload: MultipartUpload): Promise<void> {
  const first = Object.values(upload.files)[0];
  if (!first) return;
  await rm(path.dirname(first.path), { recursive: true, force: true });
}
