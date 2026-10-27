import { createWriteStream } from "node:fs";
import { mkdtemp, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { randomBytes } from "node:crypto";
import { Prisma, type ReportCampaign } from "@prisma/client";
import { writeAudit } from "@/lib/audit/log";
import {
  assertCampaignMapping,
  campaignCanActivate,
  evaluateCampaignRoster,
  suggestCampaignMapping,
  type CampaignField,
  type CampaignMapping,
} from "@/lib/campaigns/roster";
import { decodeCsvBuffer, parseCsvContent } from "@/lib/csv/parse";
import { prisma } from "@/lib/db/prisma";
import { getEnv } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { assertPlainPdf, sha256File } from "@/lib/pdf/qpdf";
import { discardWorkingDirectory, trackWorkingDirectory } from "@/lib/pdf/temp-dirs";
import { addDays, campaignUrl, decryptToken, encryptToken, generateToken, hashToken } from "@/lib/security/tokens";
import { createStorage } from "@/lib/storage";

const editableStatuses = new Set(["DRAFT", "READY"]);

function chunks<T>(items: T[], size: number): T[][] {
  const output: T[][] = [];
  for (let index = 0; index < items.length; index += size) output.push(items.slice(index, index + size));
  return output;
}

async function requireCampaign(id: string): Promise<ReportCampaign> {
  const campaign = await prisma.reportCampaign.findUnique({ where: { id } });
  if (!campaign) throw new AppError("Campaign not found.", 404, "not_found");
  return campaign;
}

export async function createCampaign(input: {
  name: string;
  linkExpiryDays: number;
  createdById: string;
}): Promise<{ id: string }> {
  const env = getEnv();
  const rawToken = generateToken();
  const campaign = await prisma.reportCampaign.create({
    data: {
      name: input.name,
      linkExpiryDays: input.linkExpiryDays,
      createdById: input.createdById,
      tokenHash: hashToken(rawToken),
      tokenCiphertext: encryptToken(rawToken, env.tokenEncryptionKey),
    },
  });
  await writeAudit({
    actorType: "ADMIN",
    actorId: input.createdById,
    action: "campaign.created",
    entityType: "ReportCampaign",
    entityId: campaign.id,
    result: "success",
  });
  return { id: campaign.id };
}

export async function listCampaigns(page: number) {
  const take = 20;
  const skip = (page - 1) * take;
  const [items, total] = await Promise.all([
    prisma.reportCampaign.findMany({
      skip,
      take,
      orderBy: { createdAt: "desc" },
      include: { createdBy: { select: { name: true } }, _count: { select: { members: true } } },
    }),
    prisma.reportCampaign.count(),
  ]);
  return { items, total, page };
}

export async function getCampaignDetail(id: string) {
  const campaign = await prisma.reportCampaign.findUnique({
    where: { id },
    include: {
      createdBy: { select: { name: true } },
      issues: { orderBy: { createdAt: "asc" }, take: 200 },
      _count: { select: { members: true } },
    },
  });
  if (!campaign) throw new AppError("Campaign not found.", 404, "not_found");
  const downloads = await prisma.campaignDownloadEvent.groupBy({
    by: ["outcome"],
    where: { campaignId: id },
    _count: { _all: true },
  });
  return {
    campaign,
    downloads: Object.fromEntries(downloads.map((row) => [row.outcome, row._count._all])),
  };
}

export async function storeCampaignSource(campaignId: string, filePath: string, actorId: string): Promise<void> {
  const campaign = await requireCampaign(campaignId);
  if (!editableStatuses.has(campaign.status)) {
    throw new AppError("The source PDF can only be replaced before the campaign is activated.", 409, "invalid_state");
  }
  const env = getEnv();
  const info = await stat(filePath);
  if (info.size > env.MAX_CAMPAIGN_PDF_MB * 1024 * 1024) {
    throw new AppError("The source PDF exceeds the configured size.", 413, "upload_too_large");
  }
  try {
    await assertPlainPdf(env.QPDF_BIN, filePath, env.PDF_GENERATION_TIMEOUT_MS);
  } catch (error) {
    const missing = error instanceof Error && "code" in error && error.code === "ENOENT";
    const message = missing ? "qpdf is not installed on this server." : error instanceof Error ? error.message : "The source PDF could not be validated.";
    throw new AppError(message.slice(0, 300), 400, "invalid_pdf");
  }
  const checksum = await sha256File(filePath);
  const key = `campaigns/${campaign.id}/source/${randomBytes(16).toString("hex")}.pdf`;
  const storage = createStorage();
  await storage.putFile(key, filePath, "application/pdf");
  const previous = campaign.sourceStorageKey;
  await prisma.reportCampaign.update({
    where: { id: campaign.id },
    data: {
      sourceStorageKey: key,
      sourceSha256: checksum,
      sourceSizeBytes: Number(info.size),
      sourceContentType: "application/pdf",
      errorSummary: null,
    },
  });
  if (previous && previous !== key) await storage.delete(previous).catch(() => undefined);
  await writeAudit({
    actorType: "ADMIN",
    actorId,
    action: previous ? "campaign.source_replaced" : "campaign.source_uploaded",
    entityType: "ReportCampaign",
    entityId: campaign.id,
    result: "success",
    metadata: { sha256: checksum, bytes: Number(info.size) },
  });
}

export async function storeCampaignCsv(campaignId: string, filePath: string, filename: string, actorId: string) {
  const campaign = await requireCampaign(campaignId);
  if (!editableStatuses.has(campaign.status)) {
    throw new AppError("The customer CSV can only be replaced before the campaign is activated.", 409, "invalid_state");
  }
  const table = parseCsvContent(decodeCsvBuffer(await import("node:fs/promises").then((fs) => fs.readFile(filePath))));
  const storage = createStorage();
  const key = `campaigns/${campaign.id}/source/customers.csv`;
  await storage.putFile(key, filePath, "text/csv");
  await prisma.reportCampaign.update({
    where: { id: campaign.id },
    data: {
      csvStorageKey: key,
      originalCsvFilename: filename,
      columnMapping: Prisma.DbNull,
      status: "DRAFT",
      errorSummary: null,
    },
  });
  await writeAudit({
    actorType: "ADMIN",
    actorId,
    action: "campaign.csv_uploaded",
    entityType: "ReportCampaign",
    entityId: campaign.id,
    result: "success",
    metadata: { filename },
  });
  return { headers: table.headers, suggestedMapping: suggestCampaignMapping(table.headers) };
}

export async function campaignCsvPreview(campaignId: string): Promise<{ headers: string[]; suggestedMapping: Partial<Record<CampaignField, string>> }> {
  const campaign = await requireCampaign(campaignId);
  if (!campaign.csvStorageKey) return { headers: [], suggestedMapping: {} };
  const storage = createStorage();
  const table = parseCsvContent(decodeCsvBuffer(await streamToBuffer(await storage.open(campaign.csvStorageKey))));
  const saved = campaign.columnMapping;
  const suggested = saved && typeof saved === "object" ? (saved as Partial<Record<CampaignField, string>>) : suggestCampaignMapping(table.headers);
  return { headers: table.headers, suggestedMapping: suggested };
}

export async function validateCampaignCsv(
  campaignId: string,
  mappingInput: Partial<Record<CampaignField, string>>,
  actorId: string,
): Promise<void> {
  const campaign = await requireCampaign(campaignId);
  if (!editableStatuses.has(campaign.status) && campaign.status !== "VALIDATING") {
    throw new AppError("This campaign can no longer be validated.", 409, "invalid_state");
  }
  if (!campaign.csvStorageKey) throw new AppError("Upload a customer CSV before validation.", 400, "missing_csv");
  const env = getEnv();
  await prisma.reportCampaign.update({ where: { id: campaign.id }, data: { status: "VALIDATING", errorSummary: null } });
  const storage = createStorage();
  const csvBuffer = await streamToBuffer(await storage.open(campaign.csvStorageKey));
  const table = parseCsvContent(decodeCsvBuffer(csvBuffer));
  const mapping = assertCampaignMapping(table.headers, mappingInput);
  const evaluation = evaluateCampaignRoster(table.records, mapping, env.DEFAULT_PHONE_REGION);
  if (env.FOLIO_GLOBALLY_UNIQUE === "true") {
    await applyGlobalFolioRule(campaign.id, evaluation.rows, evaluation.issues);
  }
  const validRecords = evaluation.rows.filter((row) => row.isValid).length;
  const invalidRecords = evaluation.rows.length - validRecords;
  const blocking = evaluation.issues.filter((issue) => issue.severity === "ERROR").length;
  const ready = validRecords > 0 && blocking === 0;

  await prisma.$transaction(async (tx) => {
    await tx.campaignVerificationSession.deleteMany({ where: { campaignId } });
    await tx.campaignDownloadEvent.deleteMany({ where: { campaignId } });
    await tx.campaignMember.deleteMany({ where: { campaignId } });
    await tx.campaignImportRow.deleteMany({ where: { campaignId } });
    await tx.campaignValidationIssue.deleteMany({ where: { campaignId } });
    for (const chunk of chunks(evaluation.rows, 500)) {
      if (chunk.length === 0) continue;
      await tx.campaignImportRow.createMany({
        data: chunk.map((row) => ({
          campaignId,
          rowNumber: row.rowNumber,
          customerName: row.customerName,
          normalizedCustomerName: row.normalizedCustomerName,
          folioNumber: row.folioNumber,
          normalizedFolioNumber: row.normalizedFolioNumber,
          email: row.email,
          phoneNumber: row.phoneNumber,
          isValid: row.isValid,
        })),
      });
    }
    const members = evaluation.rows.filter((row) => row.isValid);
    for (const chunk of chunks(members, 500)) {
      if (chunk.length === 0) continue;
      await tx.campaignMember.createMany({
        data: chunk.map((row) => ({
          campaignId,
          customerName: row.customerName,
          normalizedCustomerName: row.normalizedCustomerName,
          folioNumber: row.folioNumber,
          normalizedFolioNumber: row.normalizedFolioNumber,
          email: row.email,
          phoneNumber: row.phoneNumber,
          rowNumber: row.rowNumber,
        })),
      });
    }
    for (const chunk of chunks(evaluation.issues, 500)) {
      if (chunk.length === 0) continue;
      await tx.campaignValidationIssue.createMany({
        data: chunk.map((issue) => ({
          campaignId,
          rowNumber: issue.rowNumber,
          field: issue.field,
          code: issue.code,
          message: issue.message,
          severity: issue.severity,
        })),
      });
    }
    await tx.reportCampaign.update({
      where: { id: campaignId },
      data: {
        columnMapping: mapping,
        status: ready ? "READY" : "DRAFT",
        totalRecords: evaluation.rows.length,
        validRecords,
        invalidRecords,
        errorSummary: ready ? null : "Validation left blocking errors or no valid customers.",
      },
    });
  });

  await writeAudit({
    actorType: "ADMIN",
    actorId,
    action: "campaign.validated",
    entityType: "ReportCampaign",
    entityId: campaignId,
    result: ready ? "success" : "failure",
    metadata: { validRecords, invalidRecords, blockingIssues: blocking },
  });
}

async function applyGlobalFolioRule(
  campaignId: string,
  rows: Array<{ isValid: boolean; normalizedFolioNumber: string; rowNumber: number }>,
  issues: Array<{ rowNumber: number | null; field: string | null; code: string; message: string; severity: "ERROR" | "WARNING" }>,
): Promise<void> {
  const folios = rows.filter((row) => row.isValid).map((row) => row.normalizedFolioNumber);
  const taken = new Set<string>();
  for (const chunk of chunks(folios, 500)) {
    const [customers, members] = await Promise.all([
      prisma.customer.findMany({
        where: { normalizedFolioNumber: { in: chunk }, batch: { status: { notIn: ["CANCELLED", "FAILED"] } } },
        select: { normalizedFolioNumber: true },
      }),
      prisma.campaignMember.findMany({
        where: {
          normalizedFolioNumber: { in: chunk },
          campaignId: { not: campaignId },
          campaign: { status: { in: ["READY", "ACTIVE"] } },
        },
        select: { normalizedFolioNumber: true },
      }),
    ]);
    for (const row of customers) taken.add(row.normalizedFolioNumber);
    for (const row of members) taken.add(row.normalizedFolioNumber);
  }
  for (const row of rows) {
    if (!row.isValid || !taken.has(row.normalizedFolioNumber)) continue;
    row.isValid = false;
    issues.push({
      rowNumber: row.rowNumber,
      field: "folio_number",
      code: "DUPLICATE_FOLIO",
      message: "Folio number is already used by another active batch or campaign.",
      severity: "ERROR",
    });
  }
}

export async function activateCampaign(campaignId: string, actorId: string): Promise<void> {
  const campaign = await requireCampaign(campaignId);
  const blocking = await prisma.campaignValidationIssue.count({ where: { campaignId, severity: "ERROR" } });
  if (
    !campaignCanActivate({
      status: campaign.status,
      sourceSha256: campaign.sourceSha256,
      validRecords: campaign.validRecords,
      blockingIssues: blocking,
    })
  ) {
    throw new AppError("Activate a campaign only after a valid source PDF and a roster with no blocking errors.", 409, "invalid_state");
  }
  const expiresAt = addDays(new Date(), campaign.linkExpiryDays);
  const updated = await prisma.reportCampaign.updateMany({
    where: { id: campaignId, status: "READY" },
    data: { status: "ACTIVE", activatedAt: new Date(), expiresAt, errorSummary: null },
  });
  if (updated.count !== 1) throw new AppError("This campaign cannot be activated.", 409, "invalid_state");
  await writeAudit({
    actorType: "ADMIN",
    actorId,
    action: "campaign.activated",
    entityType: "ReportCampaign",
    entityId: campaignId,
    result: "success",
  });
}

export async function revokeCampaign(campaignId: string, actorId: string): Promise<void> {
  const updated = await prisma.reportCampaign.updateMany({
    where: { id: campaignId, status: "ACTIVE" },
    data: { status: "REVOKED", revokedAt: new Date() },
  });
  if (updated.count !== 1) throw new AppError("Only an active campaign can be revoked.", 409, "invalid_state");
  await prisma.campaignVerificationSession.deleteMany({ where: { campaignId } });
  await writeAudit({
    actorType: "ADMIN",
    actorId,
    action: "campaign.revoked",
    entityType: "ReportCampaign",
    entityId: campaignId,
    result: "success",
  });
}

export async function revealCampaignUrl(campaignId: string, actorId: string): Promise<string> {
  const campaign = await requireCampaign(campaignId);
  if (campaign.status !== "ACTIVE" || !campaign.tokenCiphertext) {
    throw new AppError("The shared URL is available after the campaign is activated.", 409, "invalid_state");
  }
  const env = getEnv();
  const raw = decryptToken(campaign.tokenCiphertext, env.tokenEncryptionKey);
  await writeAudit({
    actorType: "ADMIN",
    actorId,
    action: "campaign.url_revealed",
    entityType: "ReportCampaign",
    entityId: campaignId,
    result: "success",
  });
  return campaignUrl(env.APP_BASE_URL, raw);
}

export async function regenerateCampaignToken(campaignId: string, actorId: string): Promise<string> {
  const campaign = await requireCampaign(campaignId);
  if (campaign.status !== "ACTIVE") throw new AppError("Only an active campaign URL can be regenerated.", 409, "invalid_state");
  const env = getEnv();
  const raw = generateToken();
  await prisma.$transaction([
    prisma.reportCampaign.update({
      where: { id: campaignId },
      data: { tokenHash: hashToken(raw), tokenCiphertext: encryptToken(raw, env.tokenEncryptionKey) },
    }),
    prisma.campaignVerificationSession.deleteMany({ where: { campaignId } }),
  ]);
  await writeAudit({
    actorType: "ADMIN",
    actorId,
    action: "campaign.url_regenerated",
    entityType: "ReportCampaign",
    entityId: campaignId,
    result: "success",
  });
  return campaignUrl(env.APP_BASE_URL, raw);
}

export function parseCampaignMapping(value: unknown): Partial<Record<CampaignField, string>> {
  if (!value || typeof value !== "object") throw new AppError("Column mapping is required.", 400, "invalid_mapping");
  const mapping: Partial<Record<CampaignField, string>> = {};
  for (const field of ["customer_name", "folio_number", "email", "phone_number"] as const) {
    const column = (value as Record<string, unknown>)[field];
    if (typeof column === "string" && column.trim()) mapping[field] = column;
  }
  return mapping;
}

export async function downloadCampaignSource(campaign: ReportCampaign): Promise<{ filePath: string; directory: string }> {
  if (!campaign.sourceStorageKey || !campaign.sourceSha256) throw new AppError("The report is not available.", 404, "not_ready");
  const directory = await mkdtemp(path.join(tmpdir(), "magnum-campaign-"));
  trackWorkingDirectory(directory);
  const filePath = path.join(directory, "source.pdf");
  try {
    await pipeline(await createStorage().open(campaign.sourceStorageKey), createWriteStream(filePath));
    const checksum = await sha256File(filePath);
    if (checksum !== campaign.sourceSha256) throw new Error("Stored source checksum does not match.");
    return { filePath, directory };
  } catch (error) {
    await discardWorkingDirectory(directory);
    throw error;
  }
}

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export type { CampaignMapping };
