-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'OPERATOR');

-- CreateEnum
CREATE TYPE "BatchStatus" AS ENUM ('UPLOADED', 'VALIDATING', 'READY', 'PROCESSING', 'COMPLETED', 'COMPLETED_WITH_ERRORS', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "IssueSeverity" AS ENUM ('ERROR', 'WARNING');

-- CreateEnum
CREATE TYPE "DocumentProcessingStatus" AS ENUM ('PENDING', 'PROCESSING', 'ENCRYPTED', 'FAILED', 'QUARANTINED');

-- CreateEnum
CREATE TYPE "EncryptionStatus" AS ENUM ('PENDING', 'ENCRYPTED', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "LinkStatus" AS ENUM ('ACTIVE', 'REVOKED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "DeliveryChannel" AS ENUM ('EMAIL', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'FAILED', 'UNKNOWN', 'MOCK_RECORDED');

-- CreateEnum
CREATE TYPE "ActorType" AS ENUM ('ADMIN', 'CUSTOMER', 'SYSTEM', 'WEBHOOK');

-- CreateTable
CREATE TABLE "AdminUser" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "AdminRole" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportBatch" (
    "id" TEXT NOT NULL,
    "batchName" TEXT NOT NULL,
    "status" "BatchStatus" NOT NULL DEFAULT 'UPLOADED',
    "originalCsvFilename" TEXT NOT NULL,
    "originalZipFilename" TEXT NOT NULL,
    "csvStorageKey" TEXT NOT NULL,
    "zipStorageKey" TEXT NOT NULL,
    "columnMapping" JSONB,
    "totalRecords" INTEGER NOT NULL DEFAULT 0,
    "validRecords" INTEGER NOT NULL DEFAULT 0,
    "invalidRecords" INTEGER NOT NULL DEFAULT 0,
    "processedRecords" INTEGER NOT NULL DEFAULT 0,
    "failedRecords" INTEGER NOT NULL DEFAULT 0,
    "linkExpiryDays" INTEGER NOT NULL,
    "notifyEmail" BOOLEAN NOT NULL DEFAULT true,
    "notifyWhatsapp" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "errorSummary" TEXT,

    CONSTRAINT "ImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportRow" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "customerName" TEXT NOT NULL,
    "normalizedCustomerName" TEXT NOT NULL,
    "folioNumber" TEXT NOT NULL,
    "normalizedFolioNumber" TEXT NOT NULL,
    "email" TEXT,
    "phoneNumber" TEXT,
    "sourcePdfFilename" TEXT NOT NULL,
    "zipEntryName" TEXT,
    "isValid" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ValidationIssue" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "rowNumber" INTEGER,
    "field" TEXT,
    "code" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "severity" "IssueSeverity" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ValidationIssue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "normalizedCustomerName" TEXT NOT NULL,
    "folioNumber" TEXT NOT NULL,
    "normalizedFolioNumber" TEXT NOT NULL,
    "email" TEXT,
    "phoneNumber" TEXT,
    "sourcePdfFilename" TEXT NOT NULL,
    "zipEntryName" TEXT,
    "rowNumber" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "originalStorageKey" TEXT,
    "encryptedStorageKey" TEXT,
    "originalSha256" TEXT,
    "encryptedSha256" TEXT,
    "fileSizeBytes" INTEGER,
    "encryptedSizeBytes" INTEGER,
    "processingStatus" "DocumentProcessingStatus" NOT NULL DEFAULT 'PENDING',
    "encryptionStatus" "EncryptionStatus" NOT NULL DEFAULT 'PENDING',
    "failureReason" TEXT,
    "originalDeletedAt" TIMESTAMP(3),
    "encryptedDeletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccessLink" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "tokenCiphertext" TEXT NOT NULL,
    "status" "LinkStatus" NOT NULL DEFAULT 'ACTIVE',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "revokedById" TEXT,

    CONSTRAINT "AccessLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationSession" (
    "id" TEXT NOT NULL,
    "accessLinkId" TEXT NOT NULL,
    "sessionTokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VerificationSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryAttempt" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "accessLinkId" TEXT NOT NULL,
    "channel" "DeliveryChannel" NOT NULL,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'QUEUED',
    "providerMessageId" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastErrorCode" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "isMock" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorType" "ActorType" NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "metadata" JSONB,
    "result" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppSetting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "ExportFile" (
    "id" TEXT NOT NULL,
    "batchId" TEXT,
    "storageKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "errorSummary" TEXT,
    "createdById" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExportFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AdminUser_email_key" ON "AdminUser"("email");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");

-- CreateIndex
CREATE INDEX "ImportBatch_status_idx" ON "ImportBatch"("status");

-- CreateIndex
CREATE INDEX "ImportBatch_createdAt_idx" ON "ImportBatch"("createdAt");

-- CreateIndex
CREATE INDEX "ImportBatch_createdById_idx" ON "ImportBatch"("createdById");

-- CreateIndex
CREATE INDEX "ImportRow_batchId_isValid_idx" ON "ImportRow"("batchId", "isValid");

-- CreateIndex
CREATE INDEX "ImportRow_batchId_normalizedFolioNumber_idx" ON "ImportRow"("batchId", "normalizedFolioNumber");

-- CreateIndex
CREATE UNIQUE INDEX "ImportRow_batchId_rowNumber_key" ON "ImportRow"("batchId", "rowNumber");

-- CreateIndex
CREATE INDEX "ValidationIssue_batchId_severity_idx" ON "ValidationIssue"("batchId", "severity");

-- CreateIndex
CREATE INDEX "Customer_normalizedFolioNumber_idx" ON "Customer"("normalizedFolioNumber");

-- CreateIndex
CREATE INDEX "Customer_email_idx" ON "Customer"("email");

-- CreateIndex
CREATE INDEX "Customer_phoneNumber_idx" ON "Customer"("phoneNumber");

-- CreateIndex
CREATE INDEX "Customer_batchId_idx" ON "Customer"("batchId");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_batchId_normalizedFolioNumber_key" ON "Customer"("batchId", "normalizedFolioNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Document_customerId_key" ON "Document"("customerId");

-- CreateIndex
CREATE INDEX "Document_processingStatus_idx" ON "Document"("processingStatus");

-- CreateIndex
CREATE INDEX "Document_encryptionStatus_idx" ON "Document"("encryptionStatus");

-- CreateIndex
CREATE UNIQUE INDEX "AccessLink_tokenHash_key" ON "AccessLink"("tokenHash");

-- CreateIndex
CREATE INDEX "AccessLink_customerId_idx" ON "AccessLink"("customerId");

-- CreateIndex
CREATE INDEX "AccessLink_status_idx" ON "AccessLink"("status");

-- CreateIndex
CREATE INDEX "AccessLink_expiresAt_idx" ON "AccessLink"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationSession_sessionTokenHash_key" ON "VerificationSession"("sessionTokenHash");

-- CreateIndex
CREATE INDEX "VerificationSession_accessLinkId_idx" ON "VerificationSession"("accessLinkId");

-- CreateIndex
CREATE INDEX "VerificationSession_expiresAt_idx" ON "VerificationSession"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryAttempt_idempotencyKey_key" ON "DeliveryAttempt"("idempotencyKey");

-- CreateIndex
CREATE INDEX "DeliveryAttempt_customerId_channel_idx" ON "DeliveryAttempt"("customerId", "channel");

-- CreateIndex
CREATE INDEX "DeliveryAttempt_status_idx" ON "DeliveryAttempt"("status");

-- CreateIndex
CREATE INDEX "DeliveryAttempt_providerMessageId_idx" ON "DeliveryAttempt"("providerMessageId");

-- CreateIndex
CREATE INDEX "DeliveryAttempt_accessLinkId_idx" ON "DeliveryAttempt"("accessLinkId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_idx" ON "AuditLog"("actorId");

-- CreateIndex
CREATE INDEX "ExportFile_expiresAt_idx" ON "ExportFile"("expiresAt");

-- CreateIndex
CREATE INDEX "ExportFile_batchId_idx" ON "ExportFile"("batchId");

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AdminUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "AdminUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportRow" ADD CONSTRAINT "ImportRow_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ValidationIssue" ADD CONSTRAINT "ValidationIssue_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessLink" ADD CONSTRAINT "AccessLink_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessLink" ADD CONSTRAINT "AccessLink_revokedById_fkey" FOREIGN KEY ("revokedById") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationSession" ADD CONSTRAINT "VerificationSession_accessLinkId_fkey" FOREIGN KEY ("accessLinkId") REFERENCES "AccessLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryAttempt" ADD CONSTRAINT "DeliveryAttempt_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryAttempt" ADD CONSTRAINT "DeliveryAttempt_accessLinkId_fkey" FOREIGN KEY ("accessLinkId") REFERENCES "AccessLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppSetting" ADD CONSTRAINT "AppSetting_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExportFile" ADD CONSTRAINT "ExportFile_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ImportBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExportFile" ADD CONSTRAINT "ExportFile_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "AdminUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- One active link per customer. Revoked tokens are never reused.
CREATE UNIQUE INDEX "AccessLink_one_active_per_customer" ON "AccessLink" ("customerId") WHERE "status" = 'ACTIVE';
