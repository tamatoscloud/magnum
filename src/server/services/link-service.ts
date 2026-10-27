import { writeAudit } from "@/lib/audit/log";
import { prisma } from "@/lib/db/prisma";
import { getEnv } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { customerUrl, encryptToken, generateToken, hashToken } from "@/lib/security/tokens";

export async function revokeLink(linkId: string, actorId: string): Promise<void> {
  const updated = await prisma.accessLink.updateMany({
    where: { id: linkId, status: "ACTIVE" },
    data: { status: "REVOKED", revokedAt: new Date(), revokedById: actorId },
  });
  if (updated.count !== 1) throw new AppError("Only an active link can be revoked.", 409, "invalid_state");
  await prisma.verificationSession.deleteMany({ where: { accessLinkId: linkId } });
  await writeAudit({
    actorType: "ADMIN",
    actorId,
    action: "link.revoked",
    entityType: "AccessLink",
    entityId: linkId,
    result: "success",
  });
}

export async function regenerateLink(linkId: string, actorId: string): Promise<{ url: string; expiresAt: Date }> {
  const current = await prisma.accessLink.findUnique({ where: { id: linkId }, include: { customer: { include: { batch: true } } } });
  if (!current) throw new AppError("Link not found.", 404, "not_found");
  const env = getEnv();
  const rawToken = generateToken();
  const expiresAt = current.expiresAt;
  const created = await prisma.$transaction(async (tx) => {
    if (current.status === "ACTIVE") {
      await tx.accessLink.update({
        where: { id: current.id },
        data: { status: "REVOKED", revokedAt: new Date(), revokedById: actorId },
      });
    }
    await tx.verificationSession.deleteMany({ where: { accessLinkId: current.id } });
    return tx.accessLink.create({
      data: {
        customerId: current.customerId,
        tokenHash: hashToken(rawToken),
        tokenCiphertext: encryptToken(rawToken, env.tokenEncryptionKey),
        status: "ACTIVE",
        expiresAt,
      },
    });
  });
  await writeAudit({
    actorType: "ADMIN",
    actorId,
    action: "link.regenerated",
    entityType: "AccessLink",
    entityId: created.id,
    result: "success",
    metadata: { previousLinkId: current.id },
  });
  return { url: customerUrl(env.APP_BASE_URL, rawToken), expiresAt };
}

export async function updateLinkExpiry(linkId: string, expiresAt: Date, actorId: string): Promise<void> {
  if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() < Date.now() - 60_000) {
    throw new AppError("Choose an expiry in the future.", 400, "invalid_expiry");
  }
  const updated = await prisma.accessLink.updateMany({
    where: { id: linkId, status: "ACTIVE" },
    data: { expiresAt },
  });
  if (updated.count !== 1) throw new AppError("Only an active link can be updated.", 409, "invalid_state");
  await writeAudit({
    actorType: "ADMIN",
    actorId,
    action: "link.expiry_updated",
    entityType: "AccessLink",
    entityId: linkId,
    result: "success",
    metadata: { expiresAt: expiresAt.toISOString() },
  });
}
