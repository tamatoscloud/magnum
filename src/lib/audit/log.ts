import type { ActorType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { sanitizeMetadata } from "@/lib/security/sanitize";

export async function writeAudit(input: {
  actorType: ActorType;
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: unknown;
  result: "success" | "failure";
}): Promise<void> {
  const metadata = sanitizeMetadata(input.metadata ?? {});
  await prisma.auditLog.create({
    data: {
      actorType: input.actorType,
      actorId: input.actorId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      metadata: metadata as Prisma.InputJsonValue,
      result: input.result,
    },
  });
}
