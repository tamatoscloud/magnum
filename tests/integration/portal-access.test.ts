import { randomBytes } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { hashPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/db/prisma";
import { getEnv } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { encryptToken, generateToken, hashToken } from "@/lib/security/tokens";
import { revokeLink } from "@/server/services/link-service";
import { LINK_UNAVAILABLE, VERIFY_FAILURE, authorizeDownload, verifyCustomerIdentity } from "@/server/services/verification-service";

const suffix = randomBytes(4).toString("hex");
const email = `portal-test-${suffix}@example.com`;
let adminId = "";
let batchId = "";
let linkAId = "";
let linkBId = "";
let rawTokenA = "";
let rawTokenB = "";

describe("portal access against PostgreSQL", () => {
  afterAll(async () => {
    if (batchId) {
      await prisma.auditLog.deleteMany({ where: { entityId: { in: [linkAId, linkBId].filter(Boolean) } } });
      await prisma.importBatch.delete({ where: { id: batchId } }).catch(() => undefined);
    }
    if (adminId) await prisma.adminUser.delete({ where: { id: adminId } }).catch(() => undefined);
  });

  it("verifies the matching customer and rejects the wrong folio, expiry, and revocation", async () => {
    const admin = await prisma.adminUser.create({
      data: {
        name: "Portal Test",
        email,
        passwordHash: await hashPassword(randomBytes(24).toString("base64url")),
        role: "ADMIN",
      },
    });
    adminId = admin.id;
    const batch = await prisma.importBatch.create({
      data: {
        batchName: `portal-${suffix}`,
        originalCsvFilename: "customers.csv",
        originalZipFilename: "statements.zip",
        csvStorageKey: `tests/${suffix}/customers.csv`,
        zipStorageKey: `tests/${suffix}/statements.zip`,
        linkExpiryDays: 30,
        createdById: admin.id,
      },
    });
    batchId = batch.id;

    const customerA = await prisma.customer.create({
      data: {
        batchId: batch.id,
        customerName: "Ahmed Khan",
        normalizedCustomerName: "ahmed khan",
        folioNumber: "MAG001245",
        normalizedFolioNumber: "MAG001245",
        email: "ahmed@example.com",
        sourcePdfFilename: "MAG001245.pdf",
        rowNumber: 2,
        document: {
          create: {
            encryptedStorageKey: `tests/${suffix}/encrypted-a.pdf`,
            processingStatus: "ENCRYPTED",
            encryptionStatus: "ENCRYPTED",
          },
        },
      },
    });
    const customerB = await prisma.customer.create({
      data: {
        batchId: batch.id,
        customerName: "Sara Ali",
        normalizedCustomerName: "sara ali",
        folioNumber: "MAG001246",
        normalizedFolioNumber: "MAG001246",
        email: "sara@example.com",
        sourcePdfFilename: "MAG001246.pdf",
        rowNumber: 3,
        document: {
          create: {
            encryptedStorageKey: `tests/${suffix}/encrypted-b.pdf`,
            processingStatus: "ENCRYPTED",
            encryptionStatus: "ENCRYPTED",
          },
        },
      },
    });

    rawTokenA = generateToken();
    rawTokenB = generateToken();
    const key = getEnv().tokenEncryptionKey;
    const linkA = await prisma.accessLink.create({
      data: {
        customerId: customerA.id,
        tokenHash: hashToken(rawTokenA),
        tokenCiphertext: encryptToken(rawTokenA, key),
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });
    linkAId = linkA.id;
    const linkB = await prisma.accessLink.create({
      data: {
        customerId: customerB.id,
        tokenHash: hashToken(rawTokenB),
        tokenCiphertext: encryptToken(rawTokenB, key),
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });
    linkBId = linkB.id;

    const unknown = await verifyCustomerIdentity({
      rawToken: generateToken(),
      customerName: "Ahmed Khan",
      folioNumber: "MAG001245",
      ip: `203.0.113.${suffix.slice(0, 2)}`,
    });
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) expect(unknown.message).toBe(VERIFY_FAILURE);

    const wrongFolio = await verifyCustomerIdentity({
      rawToken: rawTokenA,
      customerName: "Ahmed Khan",
      folioNumber: "MAG009999",
      ip: "203.0.113.10",
    });
    expect(wrongFolio.ok).toBe(false);

    const verified = await verifyCustomerIdentity({
      rawToken: rawTokenA,
      customerName: "  Ahmed   Khan ",
      folioNumber: "mag001245",
      ip: "203.0.113.11",
    });
    expect(verified.ok).toBe(true);
    if (!verified.ok) return;

    const download = await authorizeDownload(verified.sessionToken, "203.0.113.12");
    expect(download.customerId).toBe(customerA.id);
    expect(download.storageKey).toBe(`tests/${suffix}/encrypted-a.pdf`);
    expect(download.storageKey).not.toBe(`tests/${suffix}/encrypted-b.pdf`);

    await expect(authorizeDownload(undefined, "203.0.113.13")).rejects.toBeInstanceOf(AppError);
    await expect(authorizeDownload(generateToken(), "203.0.113.14")).rejects.toMatchObject({ status: 401 });

    await prisma.verificationSession.updateMany({
      where: { accessLinkId: linkA.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await expect(authorizeDownload(verified.sessionToken, "203.0.113.15")).rejects.toMatchObject({ status: 401 });

    const again = await verifyCustomerIdentity({
      rawToken: rawTokenA,
      customerName: "Ahmed Khan",
      folioNumber: "MAG001245",
      ip: "203.0.113.16",
    });
    expect(again.ok).toBe(true);
    if (!again.ok) return;

    await revokeLink(linkA.id, admin.id);
    await expect(authorizeDownload(again.sessionToken, "203.0.113.17")).rejects.toMatchObject({
      status: 401,
      message: "Download is not authorized.",
    });

    const revokedVerify = await verifyCustomerIdentity({
      rawToken: rawTokenA,
      customerName: "Ahmed Khan",
      folioNumber: "MAG001245",
      ip: "203.0.113.18",
    });
    expect(revokedVerify).toMatchObject({ ok: false, message: LINK_UNAVAILABLE });

    await prisma.accessLink.update({
      where: { id: linkB.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const expired = await verifyCustomerIdentity({
      rawToken: rawTokenB,
      customerName: "Sara Ali",
      folioNumber: "MAG001246",
      ip: "203.0.113.19",
    });
    expect(expired).toMatchObject({ ok: false, message: LINK_UNAVAILABLE });
  });
});
