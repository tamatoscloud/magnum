import "../src/lib/load-env";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import JSZip from "jszip";
import { prisma } from "../src/lib/db/prisma";
import { getEnv } from "../src/lib/env";
import { customerUrl, decryptToken } from "../src/lib/security/tokens";
import { closeQueues } from "../src/server/jobs/queues";
import { createUploadedBatch, prepareBatch, validateBatch } from "../src/server/services/batch-service";
import { sendDeliveryAttempt } from "../src/server/services/delivery-service";
import { encryptCustomerDocument } from "../src/server/services/document-service";

const demoDir = path.join(process.cwd(), "demo");

const people = [
  {
    name: "Ahmed Khan",
    folio: "MAG001245",
    email: "ahmed.khan@example.com",
    phone: "+923001234567",
    file: "MAG001245.pdf",
  },
  {
    name: "Sara Ali",
    folio: "MAG001246",
    email: "sara.ali@example.com",
    phone: "",
    file: "MAG001246.pdf",
  },
  {
    name: "Bilal Hussain",
    folio: "001245",
    email: "",
    phone: "+923331112233",
    file: "001245.pdf",
  },
  {
    name: "Hina Noor",
    folio: "MAG001248",
    email: "",
    phone: "",
    file: "MAG001248.pdf",
  },
] as const;

async function statementPdf(person: (typeof people)[number]): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  const page = document.addPage([595, 842]);
  const font = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  page.drawText("MAGNUM", { x: 48, y: 780, size: 12, font: bold, color: rgb(0.45, 0.35, 0.15) });
  page.drawText("Synthetic dividend statement", { x: 48, y: 740, size: 22, font: bold, color: rgb(0.08, 0.1, 0.16) });
  page.drawText("This file is demo data. It is not a real customer statement.", {
    x: 48,
    y: 708,
    size: 12,
    font,
    color: rgb(0.25, 0.28, 0.32),
  });
  page.drawText(`Customer: ${person.name}`, { x: 48, y: 660, size: 14, font });
  page.drawText(`Folio: ${person.folio}`, { x: 48, y: 636, size: 14, font });
  page.drawText("Net dividend (demo): PKR 12,450.00", { x: 48, y: 600, size: 14, font });
  page.drawText("The PDF open password is the folio number, in uppercase, with leading zeros kept.", {
    x: 48,
    y: 120,
    size: 10,
    font,
    color: rgb(0.25, 0.28, 0.32),
  });
  return document.save();
}

function csvCell(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

async function writeDemoFiles(): Promise<{ csvPath: string; zipPath: string }> {
  await mkdir(demoDir, { recursive: true });
  const zip = new JSZip();
  for (const person of people) {
    zip.file(person.file, await statementPdf(person));
  }
  const csvPath = path.join(demoDir, "customers.csv");
  const zipPath = path.join(demoDir, "statements.zip");
  const header = "customer_name,folio_number,email,phone_number,pdf_filename";
  const rows = people.map((person) =>
    [person.name, person.folio, person.email, person.phone, person.file].map(csvCell).join(","),
  );
  await writeFile(csvPath, `${header}\n${rows.join("\n")}\n`, "utf8");
  await writeFile(zipPath, await zip.generateAsync({ type: "nodebuffer" }));
  return { csvPath, zipPath };
}

async function main(): Promise<void> {
  const admin = await prisma.adminUser.findFirst({ where: { email: "admin@magnum.local", isActive: true } });
  if (!admin) {
    console.error('Create an admin first: pnpm admin:create -- --email admin@magnum.local --name "Magnum Admin"');
    process.exit(1);
  }

  const files = await writeDemoFiles();
  const created = await createUploadedBatch({
    batchName: "Demo dividend statements",
    linkExpiryDays: 30,
    notifyEmail: true,
    notifyWhatsapp: true,
    csvPath: files.csvPath,
    csvFilename: "customers.csv",
    zipPath: files.zipPath,
    zipFilename: "statements.zip",
    createdById: admin.id,
  });

  const mapping = {
    customer_name: "customer_name",
    folio_number: "folio_number",
    email: "email",
    phone_number: "phone_number",
    pdf_filename: "pdf_filename",
  };
  await prisma.importBatch.update({ where: { id: created.id }, data: { columnMapping: mapping } });
  await validateBatch(created.id);
  const ready = await prisma.importBatch.findUniqueOrThrow({ where: { id: created.id } });
  if (ready.status !== "READY" || ready.validRecords !== people.length) {
    const issues = await prisma.validationIssue.findMany({ where: { batchId: created.id } });
    console.error(ready.status, ready.errorSummary, issues);
    process.exit(1);
  }

  await prisma.importBatch.update({
    where: { id: created.id },
    data: { status: "PROCESSING", startedAt: new Date(), errorSummary: null },
  });
  await prepareBatch(created.id);

  const customers = await prisma.customer.findMany({ where: { batchId: created.id }, orderBy: { rowNumber: "asc" } });
  for (const customer of customers) {
    await encryptCustomerDocument(customer.id);
  }

  const attempts = await prisma.deliveryAttempt.findMany({
    where: { customer: { batchId: created.id }, status: "QUEUED" },
  });
  for (const attempt of attempts) {
    await sendDeliveryAttempt(attempt.id);
  }

  const env = getEnv();
  const links = await prisma.accessLink.findMany({
    where: { customer: { batchId: created.id }, status: "ACTIVE" },
    include: { customer: { include: { document: true } } },
    orderBy: { customer: { rowNumber: "asc" } },
  });

  const lines = ["Demo portal links. These URLs are secrets. Do not commit this file.", ""];
  for (const link of links) {
    const raw = decryptToken(link.tokenCiphertext, env.tokenEncryptionKey);
    const url = customerUrl(env.APP_BASE_URL, raw);
    const customer = link.customer;
    lines.push(`${customer.customerName}`);
    lines.push(`  Folio / PDF password: ${customer.normalizedFolioNumber}`);
    lines.push(`  Email: ${customer.email ?? "(none)"}`);
    lines.push(`  Phone: ${customer.phoneNumber ?? "(none)"}`);
    lines.push(`  Document: ${customer.document?.processingStatus ?? "missing"}`);
    lines.push(`  Link: ${url}`);
    lines.push("");
    console.log(`${customer.customerName}\t${customer.normalizedFolioNumber}\t${url}`);
  }

  const batch = await prisma.importBatch.findUniqueOrThrow({ where: { id: created.id } });
  console.log(`Batch ${batch.id} status ${batch.status} encrypted ${batch.processedRecords} failed ${batch.failedRecords}`);
  await writeFile(path.join(process.cwd(), ".data", "demo-links.txt"), `${lines.join("\n")}\n`, "utf8");
  await closeQueues();
  await prisma.$disconnect();
}

main().catch(async (error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  await prisma.$disconnect();
  process.exit(1);
});
