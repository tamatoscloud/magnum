import { prisma } from "@/lib/db/prisma";
import { getEnv } from "@/lib/env";

export type RuntimeSettings = {
  defaultLinkExpiryDays: number;
  maxUploadSizeMb: number;
  originalRetentionDays: number;
  encryptedRetentionDays: number;
  exportRetentionHours: number;
  notifyEmailDefault: boolean;
  notifyWhatsappDefault: boolean;
};

const SETTING_KEYS = [
  "defaultLinkExpiryDays",
  "maxUploadSizeMb",
  "originalRetentionDays",
  "encryptedRetentionDays",
  "exportRetentionHours",
  "notifyEmailDefault",
  "notifyWhatsappDefault",
] as const;

export type SettingKey = (typeof SETTING_KEYS)[number];

export function envSettings(): RuntimeSettings {
  const env = getEnv();
  return {
    defaultLinkExpiryDays: env.DEFAULT_LINK_EXPIRY_DAYS,
    maxUploadSizeMb: env.MAX_UPLOAD_SIZE_MB,
    originalRetentionDays: env.ORIGINAL_RETENTION_DAYS,
    encryptedRetentionDays: env.ENCRYPTED_RETENTION_DAYS,
    exportRetentionHours: env.EXPORT_RETENTION_HOURS,
    notifyEmailDefault: true,
    notifyWhatsappDefault: true,
  };
}

export async function getRuntimeSettings(): Promise<RuntimeSettings> {
  const settings = envSettings();
  const rows = await prisma.appSetting.findMany({ where: { key: { in: [...SETTING_KEYS] } } });
  for (const row of rows) {
    if ((SETTING_KEYS as readonly string[]).includes(row.key)) {
      assignSetting(settings, row.key as SettingKey, row.value);
    }
  }
  return settings;
}

export async function updateRuntimeSettings(input: RuntimeSettings, actorId: string): Promise<RuntimeSettings> {
  for (const key of SETTING_KEYS) {
    await prisma.appSetting.upsert({
      where: { key },
      create: { key, value: input[key], updatedById: actorId },
      update: { value: input[key], updatedById: actorId },
    });
  }
  return getRuntimeSettings();
}

function assignSetting(settings: RuntimeSettings, key: SettingKey, value: unknown): void {
  if (key === "notifyEmailDefault" || key === "notifyWhatsappDefault") {
    if (typeof value === "boolean") settings[key] = value;
    return;
  }
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    settings[key] = value;
  }
}

export function providerStatus() {
  const env = getEnv();
  const emailMock = env.NODE_ENV !== "production" && (env.MOCK_EMAIL_ENABLED === "true" || env.EMAIL_PROVIDER === "mock");
  const whatsAppMock = env.NODE_ENV !== "production" && env.MOCK_WHATSAPP_ENABLED === "true" && !env.WHATSAPP_ACCESS_TOKEN;
  const whatsAppConfigured = Boolean(env.WHATSAPP_ACCESS_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID && env.WHATSAPP_APP_SECRET);
  return {
    email: emailMock ? "Mock delivery" : env.EMAIL_PROVIDER === "smtp" || env.EMAIL_PROVIDER === "resend" ? "Configured" : "Not configured",
    whatsapp: whatsAppConfigured ? "Configured" : whatsAppMock || (env.MOCK_WHATSAPP_ENABLED === "true" && env.NODE_ENV !== "production") ? "Mock delivery" : "Not configured",
    storage: env.STORAGE_DRIVER === "s3" ? "S3-compatible" : "Local development storage",
    pdfPasswordPolicy: env.PDF_PASSWORD_POLICY,
    pdfEncryptionBits: env.PDF_ENCRYPTION_BITS,
  };
}
