import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { writeAudit } from "@/lib/audit/log";
import { prisma } from "@/lib/db/prisma";
import { getEnv } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { encryptPdfFile, pdfPasswordFromFolio } from "@/lib/pdf/qpdf";
import { acquirePdfSlot } from "@/lib/pdf/slots";
import { discardWorkingDirectory } from "@/lib/pdf/temp-dirs";
import { clearCounter, consumeLimit, incrementCounter, readCounter } from "@/lib/rate-limit/limiter";
import { nameMatchKey, normalizeFolio, normalizeName } from "@/lib/security/normalize";
import { generateToken, hashToken, isPast, timingSafeStringEqual } from "@/lib/security/tokens";
import { downloadCampaignSource } from "@/server/services/campaign-service";
import {
  LINK_UNAVAILABLE,
  TOO_MANY_ATTEMPTS,
  VERIFY_FAILURE,
} from "@/server/services/verification-service";

export const CAMPAIGN_COOKIE = "magnum_campaign";

function identityKey(campaignId: string, name: string, folio: string): string {
  const digest = createHash("sha256").update(`${campaignId}|${name}|${folio}`).digest("hex");
  return `campaign-fail:${digest}`;
}

export async function verifyCampaignIdentity(input: {
  rawToken: string;
  customerName: string;
  folioNumber: string;
  ip: string;
}): Promise<{ ok: true; sessionToken: string; maxAgeSeconds: number } | { ok: false; message: string; status: number }> {
  const env = getEnv();
  const ipLimit = await consumeLimit(`campaign-verify:${input.ip}`, env.VERIFY_RATE_LIMIT, env.RATE_LIMIT_WINDOW_SECONDS);
  if (!ipLimit.ok) {
    await writeAudit({
      actorType: "CUSTOMER",
      action: "campaign.rate_limited",
      entityType: "ReportCampaign",
      result: "failure",
    });
    return { ok: false, message: TOO_MANY_ATTEMPTS, status: 429 };
  }

  const name = normalizeName(input.customerName);
  const folio = normalizeFolio(input.folioNumber);
  const campaign = await prisma.reportCampaign.findUnique({ where: { tokenHash: hashToken(input.rawToken) } });
  if (!campaign || campaign.status !== "ACTIVE" || (campaign.expiresAt && isPast(campaign.expiresAt))) {
    timingSafeStringEqual(name, "unknown customer");
    timingSafeStringEqual(folio, "UNKNOWN");
    if (campaign?.status === "ACTIVE" && campaign.expiresAt && isPast(campaign.expiresAt)) {
      await prisma.reportCampaign.updateMany({
        where: { id: campaign.id, status: "ACTIVE" },
        data: { status: "COMPLETED" },
      });
      await prisma.campaignVerificationSession.deleteMany({ where: { campaignId: campaign.id } });
    }
    await writeAudit({
      actorType: "CUSTOMER",
      action: "campaign.verify_failed",
      entityType: "ReportCampaign",
      entityId: campaign?.id,
      result: "failure",
      metadata: { reason: "unavailable" },
    });
    return { ok: false, message: campaign ? LINK_UNAVAILABLE : VERIFY_FAILURE, status: 401 };
  }

  const failKey = identityKey(campaign.id, name, folio);
  const failures = await readCounter(failKey);
  if (failures >= env.MAX_VERIFICATION_ATTEMPTS) {
    await writeAudit({
      actorType: "CUSTOMER",
      action: "campaign.rate_limited",
      entityType: "ReportCampaign",
      entityId: campaign.id,
      result: "failure",
    });
    return { ok: false, message: TOO_MANY_ATTEMPTS, status: 429 };
  }

  const member = await prisma.campaignMember.findUnique({
    where: { campaignId_normalizedFolioNumber: { campaignId: campaign.id, normalizedFolioNumber: folio } },
  });
  // Compare with titles and punctuation ignored (see nameMatchKey).
  const nameOk = timingSafeStringEqual(nameMatchKey(name), nameMatchKey(member?.normalizedCustomerName ?? "unknown customer"));
  if (!member || !nameOk) {
    const count = await incrementCounter(failKey, env.VERIFICATION_LOCKOUT_MINUTES * 60);
    await writeAudit({
      actorType: "CUSTOMER",
      action: "campaign.verify_failed",
      entityType: "ReportCampaign",
      entityId: campaign.id,
      result: "failure",
      metadata: { reason: "mismatch" },
    });
    if (count >= env.MAX_VERIFICATION_ATTEMPTS) return { ok: false, message: TOO_MANY_ATTEMPTS, status: 429 };
    return { ok: false, message: VERIFY_FAILURE, status: 401 };
  }

  await clearCounter(failKey);
  const sessionToken = generateToken();
  const expiresAt = new Date(Date.now() + env.VERIFICATION_SESSION_TTL_MINUTES * 60_000);
  await prisma.$transaction([
    prisma.campaignVerificationSession.deleteMany({ where: { memberId: member.id } }),
    prisma.campaignVerificationSession.create({
      data: {
        campaignId: campaign.id,
        memberId: member.id,
        sessionTokenHash: hashToken(sessionToken),
        expiresAt,
      },
    }),
  ]);
  await writeAudit({
    actorType: "CUSTOMER",
    action: "campaign.verified",
    entityType: "ReportCampaign",
    entityId: campaign.id,
    result: "success",
    metadata: { memberId: member.id },
  });
  return { ok: true, sessionToken, maxAgeSeconds: env.VERIFICATION_SESSION_TTL_MINUTES * 60 };
}

export async function openCampaignDownload(rawSession: string | undefined, ip: string): Promise<{
  outputPath: string;
  directory: string;
  release: () => void;
  eventId: string;
  campaignId: string;
  memberId: string;
}> {
  const env = getEnv();
  if (!rawSession) throw new AppError("Download is not authorized.", 401, "unauthorized");
  const limit = await consumeLimit(`campaign-download:${ip}`, env.DOWNLOAD_RATE_LIMIT, env.RATE_LIMIT_WINDOW_SECONDS);
  if (!limit.ok) throw new AppError("Too many download attempts. Try again later.", 429, "rate_limited");

  const session = await prisma.campaignVerificationSession.findUnique({
    where: { sessionTokenHash: hashToken(rawSession) },
    include: { campaign: true, member: true },
  });
  if (!session || isPast(session.expiresAt)) throw new AppError("Download is not authorized.", 401, "unauthorized");
  if (session.campaign.status !== "ACTIVE" || (session.campaign.expiresAt && isPast(session.campaign.expiresAt))) {
    await prisma.campaignVerificationSession.deleteMany({ where: { campaignId: session.campaignId } });
    throw new AppError(LINK_UNAVAILABLE, 401, "link_inactive");
  }

  let release: (() => void) | null = null;
  let sourceDirectory: string | null = null;
  let encryptedDirectory: string | null = null;
  try {
    release = await acquirePdfSlot(env.CAMPAIGN_PDF_CONCURRENCY, env.PDF_GENERATION_TIMEOUT_MS);
    const source = await downloadCampaignSource(session.campaign);
    sourceDirectory = source.directory;
    const encrypted = await encryptPdfFile({
      sourcePath: source.filePath,
      userPassword: pdfPasswordFromFolio(session.member.normalizedFolioNumber, env.PDF_PASSWORD_POLICY),
      bits: Number(env.PDF_ENCRYPTION_BITS) as 128 | 256,
      qpdfBin: env.QPDF_BIN,
      timeoutMs: env.PDF_GENERATION_TIMEOUT_MS,
    });
    encryptedDirectory = encrypted.directory;
    await discardWorkingDirectory(sourceDirectory);
    sourceDirectory = null;
    if (encrypted.encryptedSize <= 0) throw new Error("Encrypted report is empty.");
    const event = await prisma.campaignDownloadEvent.create({
      data: { campaignId: session.campaignId, memberId: session.memberId, outcome: "PREPARED" },
    });
    await writeAudit({
      actorType: "CUSTOMER",
      action: "campaign.download_prepared",
      entityType: "ReportCampaign",
      entityId: session.campaignId,
      result: "success",
      metadata: { memberId: session.memberId, eventId: event.id },
    });
    return {
      outputPath: encrypted.outputPath,
      directory: encrypted.directory,
      release,
      eventId: event.id,
      campaignId: session.campaignId,
      memberId: session.memberId,
    };
  } catch (error) {
    if (sourceDirectory) await discardWorkingDirectory(sourceDirectory);
    if (encryptedDirectory) await discardWorkingDirectory(encryptedDirectory);
    release?.();
    await prisma.campaignDownloadEvent.create({
      data: { campaignId: session.campaignId, memberId: session.memberId, outcome: "FAILED" },
    }).catch(() => undefined);
    await writeAudit({
      actorType: "CUSTOMER",
      action: "campaign.download_failed",
      entityType: "ReportCampaign",
      entityId: session.campaignId,
      result: "failure",
      metadata: { memberId: session.memberId },
    });
    if (error instanceof AppError) throw error;
    const missingQpdf = error instanceof Error && "code" in error && error.code === "ENOENT";
    throw new AppError(missingQpdf ? "The report cannot be prepared right now." : "The report cannot be prepared right now.", 503, "generation_failed");
  }
}

export function streamEncryptedReport(input: {
  outputPath: string;
  directory: string;
  release: () => void;
  eventId: string;
  campaignId: string;
  memberId: string;
}): ReadableStream {
  const node = createReadStream(input.outputPath);
  let ended = false;
  let settled = false;
  const finish = (outcome: "COMPLETED" | "ABORTED") => {
    if (settled) return;
    settled = true;
    input.release();
    void prisma.campaignDownloadEvent.update({ where: { id: input.eventId }, data: { outcome } }).catch(() => undefined);
    void writeAudit({
      actorType: "CUSTOMER",
      action: outcome === "COMPLETED" ? "campaign.download_completed" : "campaign.download_aborted",
      entityType: "ReportCampaign",
      entityId: input.campaignId,
      result: outcome === "COMPLETED" ? "success" : "failure",
      metadata: { memberId: input.memberId, eventId: input.eventId },
    });
    void discardWorkingDirectory(input.directory);
  };
  node.on("end", () => {
    ended = true;
  });
  node.on("close", () => finish(ended ? "COMPLETED" : "ABORTED"));
  node.on("error", () => finish("ABORTED"));
  return Readable.toWeb(node) as ReadableStream;
}
