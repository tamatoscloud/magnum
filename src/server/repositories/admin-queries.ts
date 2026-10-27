import type { AdminRole, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

export async function dashboardStats() {
  const [batches, customers, documents, links, email, whatsapp, recent] = await Promise.all([
    prisma.importBatch.count(),
    prisma.customer.count(),
    prisma.document.count({ where: { processingStatus: "ENCRYPTED" } }),
    prisma.accessLink.count({ where: { status: "ACTIVE", expiresAt: { gt: new Date() } } }),
    prisma.deliveryAttempt.groupBy({ by: ["status"], where: { channel: "EMAIL" }, _count: { _all: true } }),
    prisma.deliveryAttempt.groupBy({ by: ["status"], where: { channel: "WHATSAPP" }, _count: { _all: true } }),
    prisma.importBatch.findMany({
      orderBy: { createdAt: "desc" },
      take: 6,
      select: {
        id: true,
        batchName: true,
        status: true,
        totalRecords: true,
        validRecords: true,
        processedRecords: true,
        failedRecords: true,
        createdAt: true,
      },
    }),
  ]);
  const failed = await prisma.importBatch.aggregate({ _sum: { failedRecords: true, invalidRecords: true } });
  return {
    batches,
    customers,
    documents,
    activeLinks: links,
    failedRecords: (failed._sum.failedRecords ?? 0) + (failed._sum.invalidRecords ?? 0),
    email: Object.fromEntries(email.map((row) => [row.status, row._count._all])),
    whatsapp: Object.fromEntries(whatsapp.map((row) => [row.status, row._count._all])),
    recent,
  };
}

export async function listBatches(page: number) {
  const take = 20;
  const [items, total] = await Promise.all([
    prisma.importBatch.findMany({
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * take,
      take,
      include: { createdBy: { select: { name: true, email: true } } },
    }),
    prisma.importBatch.count(),
  ]);
  return { items, total, page, pages: Math.max(1, Math.ceil(total / take)) };
}

export async function getBatchDetail(id: string) {
  return prisma.importBatch.findUnique({
    where: { id },
    include: {
      createdBy: { select: { name: true, email: true } },
      validationIssues: { orderBy: [{ severity: "asc" }, { rowNumber: "asc" }], take: 200 },
      _count: { select: { customers: true, validationIssues: true } },
    },
  });
}

export function customerWhere(input: {
  q?: string;
  batchId?: string;
  processingStatus?: string;
  linkStatus?: string;
}): Prisma.CustomerWhereInput {
  const where: Prisma.CustomerWhereInput = {};
  if (input.batchId) where.batchId = input.batchId;
  if (input.q) {
    where.OR = [
      { customerName: { contains: input.q, mode: "insensitive" } },
      { folioNumber: { contains: input.q, mode: "insensitive" } },
      { normalizedFolioNumber: { contains: input.q.toUpperCase(), mode: "insensitive" } },
      { email: { contains: input.q, mode: "insensitive" } },
      { phoneNumber: { contains: input.q } },
    ];
  }
  if (input.processingStatus) where.document = { processingStatus: input.processingStatus as never };
  if (input.linkStatus) where.accessLinks = { some: { status: input.linkStatus as never } };
  return where;
}

export async function searchCustomers(input: {
  q?: string;
  batchId?: string;
  processingStatus?: string;
  linkStatus?: string;
  page: number;
}) {
  const take = 25;
  const where = customerWhere(input);
  const [items, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (input.page - 1) * take,
      take,
      include: {
        batch: { select: { id: true, batchName: true } },
        document: { select: { processingStatus: true, encryptionStatus: true, failureReason: true } },
        accessLinks: { orderBy: { createdAt: "desc" }, take: 1, select: { id: true, status: true, expiresAt: true, lastUsedAt: true } },
      },
    }),
    prisma.customer.count({ where }),
  ]);
  return { items, total, page: input.page, pages: Math.max(1, Math.ceil(total / take)) };
}

export async function getCustomerDetail(id: string) {
  return prisma.customer.findUnique({
    where: { id },
    include: {
      batch: true,
      document: true,
      accessLinks: { orderBy: { createdAt: "desc" } },
      deliveries: { orderBy: { createdAt: "desc" }, take: 20 },
    },
  });
}

export async function listDocuments(page: number, status?: string) {
  const take = 25;
  const where = status ? { processingStatus: status as never } : {};
  const [items, total] = await Promise.all([
    prisma.document.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * take,
      take,
      include: { customer: { select: { id: true, customerName: true, folioNumber: true, batchId: true, sourcePdfFilename: true } } },
    }),
    prisma.document.count({ where }),
  ]);
  return { items, total, page, pages: Math.max(1, Math.ceil(total / take)) };
}

export async function listAuditLogs(input: { page: number; action?: string; entityType?: string }) {
  const take = 30;
  const where: Prisma.AuditLogWhereInput = {};
  if (input.action) where.action = { contains: input.action };
  if (input.entityType) where.entityType = input.entityType;
  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (input.page - 1) * take,
      take,
    }),
    prisma.auditLog.count({ where }),
  ]);
  return { items, total, page: input.page, pages: Math.max(1, Math.ceil(total / take)) };
}

export async function listUsers() {
  return prisma.adminUser.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true },
  });
}

export type PublicUser = {
  id: string;
  name: string;
  email: string;
  role: AdminRole;
};
