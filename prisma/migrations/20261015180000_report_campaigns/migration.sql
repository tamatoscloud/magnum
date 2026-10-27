-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'VALIDATING', 'READY', 'ACTIVE', 'REVOKED', 'COMPLETED');

-- CreateTable
CREATE TABLE "ReportCampaign" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "sourceStorageKey" TEXT,
    "sourceSha256" TEXT,
    "sourceSizeBytes" INTEGER,
    "sourceContentType" TEXT,
    "tokenHash" TEXT,
    "tokenCiphertext" TEXT,
    "csvStorageKey" TEXT,
    "originalCsvFilename" TEXT,
    "columnMapping" JSONB,
    "totalRecords" INTEGER NOT NULL DEFAULT 0,
    "validRecords" INTEGER NOT NULL DEFAULT 0,
    "invalidRecords" INTEGER NOT NULL DEFAULT 0,
    "linkExpiryDays" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "activatedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "errorSummary" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReportCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignMember" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "normalizedCustomerName" TEXT NOT NULL,
    "folioNumber" TEXT NOT NULL,
    "normalizedFolioNumber" TEXT NOT NULL,
    "email" TEXT,
    "phoneNumber" TEXT,
    "rowNumber" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignImportRow" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "customerName" TEXT NOT NULL,
    "normalizedCustomerName" TEXT NOT NULL,
    "folioNumber" TEXT NOT NULL,
    "normalizedFolioNumber" TEXT NOT NULL,
    "email" TEXT,
    "phoneNumber" TEXT,
    "isValid" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignImportRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignValidationIssue" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "rowNumber" INTEGER,
    "field" TEXT,
    "code" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "severity" "IssueSeverity" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignValidationIssue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignVerificationSession" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "sessionTokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignVerificationSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignDownloadEvent" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignDownloadEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReportCampaign_tokenHash_key" ON "ReportCampaign"("tokenHash");

-- CreateIndex
CREATE INDEX "ReportCampaign_status_idx" ON "ReportCampaign"("status");

-- CreateIndex
CREATE INDEX "ReportCampaign_createdAt_idx" ON "ReportCampaign"("createdAt");

-- CreateIndex
CREATE INDEX "ReportCampaign_createdById_idx" ON "ReportCampaign"("createdById");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignMember_campaignId_normalizedFolioNumber_key" ON "CampaignMember"("campaignId", "normalizedFolioNumber");

-- CreateIndex
CREATE INDEX "CampaignMember_campaignId_idx" ON "CampaignMember"("campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignImportRow_campaignId_rowNumber_key" ON "CampaignImportRow"("campaignId", "rowNumber");

-- CreateIndex
CREATE INDEX "CampaignImportRow_campaignId_isValid_idx" ON "CampaignImportRow"("campaignId", "isValid");

-- CreateIndex
CREATE INDEX "CampaignValidationIssue_campaignId_severity_idx" ON "CampaignValidationIssue"("campaignId", "severity");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignVerificationSession_sessionTokenHash_key" ON "CampaignVerificationSession"("sessionTokenHash");

-- CreateIndex
CREATE INDEX "CampaignVerificationSession_campaignId_idx" ON "CampaignVerificationSession"("campaignId");

-- CreateIndex
CREATE INDEX "CampaignVerificationSession_memberId_idx" ON "CampaignVerificationSession"("memberId");

-- CreateIndex
CREATE INDEX "CampaignVerificationSession_expiresAt_idx" ON "CampaignVerificationSession"("expiresAt");

-- CreateIndex
CREATE INDEX "CampaignDownloadEvent_campaignId_createdAt_idx" ON "CampaignDownloadEvent"("campaignId", "createdAt");

-- AddForeignKey
ALTER TABLE "ReportCampaign" ADD CONSTRAINT "ReportCampaign_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "AdminUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignMember" ADD CONSTRAINT "CampaignMember_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "ReportCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignImportRow" ADD CONSTRAINT "CampaignImportRow_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "ReportCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignValidationIssue" ADD CONSTRAINT "CampaignValidationIssue_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "ReportCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignVerificationSession" ADD CONSTRAINT "CampaignVerificationSession_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "ReportCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignVerificationSession" ADD CONSTRAINT "CampaignVerificationSession_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "CampaignMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignDownloadEvent" ADD CONSTRAINT "CampaignDownloadEvent_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "ReportCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignDownloadEvent" ADD CONSTRAINT "CampaignDownloadEvent_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "CampaignMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;
