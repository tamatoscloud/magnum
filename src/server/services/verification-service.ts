import { prisma } from "@/lib/db/prisma";
import { getEnv } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { writeAudit } from "@/lib/audit/log";
import { clearCounter, consumeLimit, incrementCounter, readCounter } from "@/lib/rate-limit/limiter";
import { normalizeFolio, normalizeName } from "@/lib/security/normalize";
import { generateToken, hashToken, isPast, timingSafeStringEqual } from "@/lib/security/tokens";

export const PORTAL_COOKIE = "magnum_portal";
export const VERIFY_FAILURE = "We could not verify those details. Check the name and folio number and try again.";
export const LINK_UNAVAILABLE = "This link is no longer available.";
export const TOO_MANY_ATTEMPTS = "Too many attempts. Try again later.";

export async function verifyCustomerIdentity(input: {
  rawToken: string;
  customerName: string;
  folioNumber: string;
  ip: string;
}): Promise<{ ok: true; sessionToken: string; maxAgeSeconds: number } | { ok: false; message: string; status: number }> {
  const env = getEnv();
  const ipLimit = await consumeLimit(`verify:${input.ip}`, env.VERIFY_RATE_LIMIT, env.RATE_LIMIT_WINDOW_SECONDS);
  if (!ipLimit.ok) return { ok: false, message: TOO_MANY_ATTEMPTS, status: 429 };

  const link = await prisma.accessLink.findUnique({
    where: { tokenHash: hashToken(input.rawToken) },
    include: { customer: true },
  });

  if (!link) {
    timingSafeStringEqual(normalizeName(input.customerName), "unknown customer");
    timingSafeStringEqual(normalizeFolio(input.folioNumber), "UNKNOWN");
    await writeAudit({
      actorType: "CUSTOMER",
      action: "portal.verify_failed",
      entityType: "AccessLink",
      result: "failure",
      metadata: { reason: "unavailable" },
    });
    return { ok: false, message: VERIFY_FAILURE, status: 401 };
  }

  const failures = await readCounter(`verify-fail:${link.id}`);
  if (failures >= env.MAX_VERIFICATION_ATTEMPTS) {
    return { ok: false, message: TOO_MANY_ATTEMPTS, status: 429 };
  }

  if (link.status !== "ACTIVE" || isPast(link.expiresAt)) {
    if (link.status === "ACTIVE") {
      await prisma.accessLink.update({ where: { id: link.id }, data: { status: "EXPIRED" } });
    }
    await writeAudit({
      actorType: "CUSTOMER",
      action: "portal.verify_failed",
      entityType: "AccessLink",
      entityId: link.id,
      result: "failure",
      metadata: { reason: "inactive" },
    });
    return { ok: false, message: LINK_UNAVAILABLE, status: 401 };
  }

  const nameOk = timingSafeStringEqual(normalizeName(input.customerName), link.customer.normalizedCustomerName);
  const folioOk = timingSafeStringEqual(normalizeFolio(input.folioNumber), link.customer.normalizedFolioNumber);
  if (!nameOk || !folioOk) {
    const count = await incrementCounter(`verify-fail:${link.id}`, env.VERIFICATION_LOCKOUT_MINUTES * 60);
    await writeAudit({
      actorType: "CUSTOMER",
      action: "portal.verify_failed",
      entityType: "AccessLink",
      entityId: link.id,
      result: "failure",
      metadata: { reason: "mismatch" },
    });
    if (count >= env.MAX_VERIFICATION_ATTEMPTS) return { ok: false, message: TOO_MANY_ATTEMPTS, status: 429 };
    return { ok: false, message: VERIFY_FAILURE, status: 401 };
  }

  await clearCounter(`verify-fail:${link.id}`);
  const sessionToken = generateToken();
  const expiresAt = new Date(Date.now() + env.VERIFICATION_SESSION_TTL_MINUTES * 60_000);
  await prisma.$transaction([
    prisma.verificationSession.deleteMany({ where: { accessLinkId: link.id } }),
    prisma.verificationSession.create({
      data: { accessLinkId: link.id, sessionTokenHash: hashToken(sessionToken), expiresAt, failedAttempts: 0 },
    }),
    prisma.accessLink.update({ where: { id: link.id }, data: { lastUsedAt: new Date() } }),
  ]);
  await writeAudit({
    actorType: "CUSTOMER",
    action: "portal.verified",
    entityType: "AccessLink",
    entityId: link.id,
    result: "success",
  });
  return { ok: true, sessionToken, maxAgeSeconds: env.VERIFICATION_SESSION_TTL_MINUTES * 60 };
}

export async function authorizeDownload(rawSession: string | undefined, ip: string): Promise<{
  storageKey: string;
  customerId: string;
  linkId: string;
}> {
  const env = getEnv();
  if (!rawSession) throw new AppError("Download is not authorized.", 401, "unauthorized");
  const limit = await consumeLimit(`download:${ip}`, env.DOWNLOAD_RATE_LIMIT, env.RATE_LIMIT_WINDOW_SECONDS);
  if (!limit.ok) throw new AppError("Too many download attempts. Try again later.", 429, "rate_limited");

  const session = await prisma.verificationSession.findUnique({
    where: { sessionTokenHash: hashToken(rawSession) },
    include: { accessLink: { include: { customer: { include: { document: true } } } } },
  });
  if (!session || isPast(session.expiresAt)) throw new AppError("Download is not authorized.", 401, "unauthorized");

  const link = session.accessLink;
  if (link.status !== "ACTIVE" || isPast(link.expiresAt)) {
    if (link.status === "ACTIVE") await prisma.accessLink.update({ where: { id: link.id }, data: { status: "EXPIRED" } });
    throw new AppError("This link is no longer available.", 401, "link_inactive");
  }
  const storageKey = link.customer.document?.encryptedStorageKey;
  if (!storageKey || link.customer.document?.processingStatus !== "ENCRYPTED") {
    throw new AppError("The statement is not available.", 404, "not_ready");
  }
  return { storageKey, customerId: link.customerId, linkId: link.id };
}
