import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { hashPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/db/prisma";
import { getEnv } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { runQpdf, sha256File } from "@/lib/pdf/qpdf";
import {
  activateCampaign,
  createCampaign,
  downloadCampaignSource,
  revokeCampaign,
  storeCampaignCsv,
  storeCampaignSource,
  validateCampaignCsv,
} from "@/server/services/campaign-service";
import { openCampaignDownload, streamEncryptedReport, verifyCampaignIdentity } from "@/server/services/campaign-portal";
import { LINK_UNAVAILABLE, VERIFY_FAILURE } from "@/server/services/verification-service";
import { discardWorkingDirectory } from "@/lib/pdf/temp-dirs";

const suffix = randomBytes(4).toString("hex");
let adminId = "";
let campaignId = "";
let otherCampaignId = "";
let sourceSha = "";

async function samplePdf(label: string): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  const page = document.addPage();
  const font = await document.embedFont(StandardFonts.Helvetica);
  page.drawText(label, { x: 48, y: 720, size: 18, font });
  return document.save();
}

async function readStream(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  for (;;) {
    const next = await reader.read();
    if (next.done) break;
    if (next.value) chunks.push(next.value);
  }
  return Buffer.concat(chunks);
}

async function opensWith(filePath: string, password: string): Promise<boolean> {
  const directory = path.dirname(filePath);
  const passwordFile = path.join(directory, `${password.replaceAll(/[^\w]/g, "")}-password.txt`);
  const output = path.join(directory, `${password.replaceAll(/[^\w]/g, "")}-opened.pdf`);
  await writeFile(passwordFile, `${password}\n`);
  const result = await runQpdf(getEnv().QPDF_BIN, [`--password-file=${passwordFile}`, "--decrypt", filePath, output], [password]);
  return result.code === 0;
}

describe("shared annual report campaign", () => {
  afterAll(async () => {
    if (campaignId) await prisma.reportCampaign.delete({ where: { id: campaignId } }).catch(() => undefined);
    if (otherCampaignId) await prisma.reportCampaign.delete({ where: { id: otherCampaignId } }).catch(() => undefined);
    if (campaignId || otherCampaignId) {
      await prisma.auditLog.deleteMany({ where: { entityId: { in: [campaignId, otherCampaignId].filter(Boolean) } } });
    }
    if (adminId) await prisma.adminUser.delete({ where: { id: adminId } }).catch(() => undefined);
  });

  it("encrypts one source PDF per customer at download time and cleans the temporary files", async () => {
    const documentsBefore = await prisma.document.count();
    const admin = await prisma.adminUser.create({
      data: {
        name: "Campaign Test",
        email: `campaign-${suffix}@example.com`,
        passwordHash: await hashPassword(randomBytes(24).toString("base64url")),
        role: "ADMIN",
      },
    });
    adminId = admin.id;
    const created = await createCampaign({ name: `Annual ${suffix}`, linkExpiryDays: 30, createdById: admin.id });
    campaignId = created.id;

    const directory = await mkdtemp(path.join(tmpdir(), "magnum-fixture-"));
    const pdfPath = path.join(directory, "annual.pdf");
    const csvPath = path.join(directory, "customers.csv");
    await writeFile(pdfPath, await samplePdf("Synthetic annual report"));
    await writeFile(
      csvPath,
      "customer_name,folio_number,email,phone_number\nAhmed Khan,MAG001245,ahmed@example.com,\nBilal Hussain,001245,,\n",
    );
    await storeCampaignSource(created.id, pdfPath, admin.id);
    await storeCampaignCsv(created.id, csvPath, "customers.csv", admin.id);
    await validateCampaignCsv(
      created.id,
      { customer_name: "customer_name", folio_number: "folio_number", email: "email", phone_number: "phone_number" },
      admin.id,
    );
    await activateCampaign(created.id, admin.id);
    const stored = await prisma.reportCampaign.findUniqueOrThrow({ where: { id: created.id } });
    sourceSha = stored.sourceSha256 ?? "";
    expect(stored.status).toBe("ACTIVE");
    expect(stored.validRecords).toBe(2);

    const other = await createCampaign({ name: `Other ${suffix}`, linkExpiryDays: 30, createdById: admin.id });
    otherCampaignId = other.id;
    const otherPdf = path.join(directory, "other.pdf");
    const otherCsv = path.join(directory, "other.csv");
    await writeFile(otherPdf, await samplePdf("Other report"));
    await writeFile(otherCsv, "customer_name,folio_number\nSara Ali,MAG009999\n");
    await storeCampaignSource(other.id, otherPdf, admin.id);
    await storeCampaignCsv(other.id, otherCsv, "other.csv", admin.id);
    await validateCampaignCsv(other.id, { customer_name: "customer_name", folio_number: "folio_number" }, admin.id);
    await activateCampaign(other.id, admin.id);

    const raw = (await import("@/lib/security/tokens")).decryptToken(stored.tokenCiphertext ?? "", getEnv().tokenEncryptionKey);
    const wrong = await verifyCampaignIdentity({ rawToken: raw, customerName: "Sara Ali", folioNumber: "MAG009999", ip: "10.0.0.8" });
    expect(wrong).toMatchObject({ ok: false, message: VERIFY_FAILURE });
    const unknown = await verifyCampaignIdentity({ rawToken: "x".repeat(43), customerName: "Ahmed Khan", folioNumber: "MAG001245", ip: "10.0.0.9" });
    expect(unknown).toMatchObject({ ok: false, message: VERIFY_FAILURE });

    const ahmed = await verifyCampaignIdentity({ rawToken: raw, customerName: "  Ahmed   Khan ", folioNumber: "mag001245", ip: "10.0.0.10" });
    const bilal = await verifyCampaignIdentity({ rawToken: raw, customerName: "Bilal Hussain", folioNumber: "001245", ip: "10.0.0.11" });
    if (!ahmed.ok || !bilal.ok) throw new Error("Expected both campaign customers to verify.");

    const [first, second] = await Promise.all([
      openCampaignDownload(ahmed.sessionToken, "10.0.0.10"),
      openCampaignDownload(bilal.sessionToken, "10.0.0.11"),
    ]);
    expect(first.directory).not.toBe(second.directory);
    const firstBytes = await readStream(streamEncryptedReport(first));
    const secondBytes = await readStream(streamEncryptedReport(second));
    const firstFile = path.join(directory, "ahmed.pdf");
    const secondFile = path.join(directory, "bilal.pdf");
    await writeFile(firstFile, firstBytes);
    await writeFile(secondFile, secondBytes);
    expect(firstBytes.subarray(0, 5).toString("utf8")).toBe("%PDF-");
    expect(await opensWith(firstFile, "MAG001245")).toBe(true);
    expect(await opensWith(firstFile, "001245")).toBe(false);
    expect(await opensWith(secondFile, "001245")).toBe(true);
    expect(await opensWith(secondFile, "MAG001245")).toBe(false);

    const again = await downloadCampaignSource(stored);
    expect(await sha256File(again.filePath)).toBe(sourceSha);
    await discardWorkingDirectory(again.directory);
    expect(await prisma.document.count()).toBe(documentsBefore);
    const events = await prisma.campaignDownloadEvent.findMany({ where: { campaignId: created.id } });
    expect(JSON.stringify(events)).not.toContain("MAG001245");
    expect(JSON.stringify(events)).not.toContain("001245");

    await new Promise((resolve) => setTimeout(resolve, 200));
    await expect(readFile(first.outputPath)).rejects.toThrow();
    await expect(readFile(second.outputPath)).rejects.toThrow();

    await revokeCampaign(created.id, admin.id);
    const revoked = await verifyCampaignIdentity({ rawToken: raw, customerName: "Ahmed Khan", folioNumber: "MAG001245", ip: "10.0.0.12" });
    expect(revoked).toMatchObject({ ok: false, message: LINK_UNAVAILABLE });
    await expect(openCampaignDownload(ahmed.sessionToken, "10.0.0.12")).rejects.toBeInstanceOf(AppError);
    await rm(directory, { recursive: true, force: true });
  }, 120_000);
});
