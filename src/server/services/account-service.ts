import { prisma } from "@/lib/db/prisma";
import { getEnv } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { hashPassword } from "@/lib/auth/password";
import { writeAudit } from "@/lib/audit/log";
import { createEmailSender } from "@/lib/email/sender";
import { generateToken, hashToken } from "@/lib/security/tokens";
import type { AdminRole } from "@prisma/client";
import { randomBytes } from "node:crypto";

const ROLES: AdminRole[] = ["SUPER_ADMIN", "ADMIN", "OPERATOR"];

export async function createAdminUser(input: { name: string; email: string; role: AdminRole; actorId: string }): Promise<void> {
  if (!ROLES.includes(input.role)) throw new AppError("Unknown role.", 400, "invalid_role");
  const email = input.email.trim().toLocaleLowerCase("en-US");
  const existing = await prisma.adminUser.findUnique({ where: { email } });
  if (existing) throw new AppError("An account with that email already exists.", 409, "duplicate_email");
  const passwordHash = await hashPassword(randomBytes(32).toString("base64url"));
  const user = await prisma.adminUser.create({
    data: { name: input.name.trim(), email, role: input.role, passwordHash, isActive: true },
  });
  await issuePasswordReset(user.id, user.email, user.name);
  await writeAudit({
    actorType: "ADMIN",
    actorId: input.actorId,
    action: "user.created",
    entityType: "AdminUser",
    entityId: user.id,
    result: "success",
    metadata: { role: input.role },
  });
}

export async function setAdminActive(userId: string, isActive: boolean, actorId: string): Promise<void> {
  if (userId === actorId && !isActive) throw new AppError("You cannot deactivate your own account.", 409, "invalid_state");
  const user = await prisma.adminUser.findUnique({ where: { id: userId } });
  if (!user) throw new AppError("User not found.", 404, "not_found");
  if (!isActive && user.role === "SUPER_ADMIN") {
    const others = await prisma.adminUser.count({ where: { role: "SUPER_ADMIN", isActive: true, id: { not: userId } } });
    if (others === 0) throw new AppError("Keep at least one active super admin.", 409, "last_super_admin");
  }
  await prisma.adminUser.update({ where: { id: userId }, data: { isActive } });
  await writeAudit({
    actorType: "ADMIN",
    actorId,
    action: isActive ? "user.activated" : "user.deactivated",
    entityType: "AdminUser",
    entityId: userId,
    result: "success",
  });
}

export async function requestPasswordReset(emailRaw: string): Promise<void> {
  const email = emailRaw.trim().toLocaleLowerCase("en-US");
  const user = await prisma.adminUser.findUnique({ where: { email } });
  if (!user?.isActive) return;
  await issuePasswordReset(user.id, user.email, user.name);
  await writeAudit({
    actorType: "ADMIN",
    actorId: user.id,
    action: "auth.password_reset_requested",
    entityType: "AdminUser",
    entityId: user.id,
    result: "success",
  });
}

export async function resetPassword(rawToken: string, passwordHash: string): Promise<void> {
  const tokenHash = hashToken(rawToken);
  const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash }, include: { user: true } });
  if (!record || record.usedAt || record.expiresAt.getTime() <= Date.now() || !record.user.isActive) {
    throw new AppError("This reset link is invalid or has expired.", 400, "invalid_token");
  }
  await prisma.$transaction([
    prisma.adminUser.update({ where: { id: record.userId }, data: { passwordHash } }),
    prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    prisma.passwordResetToken.deleteMany({ where: { userId: record.userId, usedAt: null, id: { not: record.id } } }),
  ]);
  await writeAudit({
    actorType: "ADMIN",
    actorId: record.userId,
    action: "auth.password_reset",
    entityType: "AdminUser",
    entityId: record.userId,
    result: "success",
  });
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

async function issuePasswordReset(userId: string, email: string, name: string): Promise<void> {
  const rawToken = generateToken();
  const env = getEnv();
  await prisma.passwordResetToken.deleteMany({ where: { userId, usedAt: null } });
  await prisma.passwordResetToken.create({
    data: {
      userId,
      tokenHash: hashToken(rawToken),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  });
  const accessUrl = `${env.APP_BASE_URL}/reset-password?token=${rawToken}`;
  const sender = createEmailSender();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
  await sender.send({
    to: email,
    customerName: name,
    accessUrl,
    expiresAt,
    idempotencyKey: `password-reset-${userId}-${Date.now()}`,
    subject: "Reset your Magnum admin password",
    text: `Hello ${name},\n\nUse this link to set a new password. It expires in one hour.\n${accessUrl}\n`,
    html: `<p>Hello ${escapeHtml(name)},</p><p><a href="${escapeHtml(accessUrl)}">Set a new password</a></p><p>This link expires in one hour.</p>`,
  });
}
