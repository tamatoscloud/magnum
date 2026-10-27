import { z } from "zod";

const DEV_TOKEN_KEY = Buffer.from("dev-only-token-key-not-for-prod!").toString("base64");
const DEV_TOKEN_KEYS = new Set([DEV_TOKEN_KEY]);

const DEV_AUTH_SECRETS = new Set(["dev-only-nextauth-secret-change-me-now"]);

const booleanString = z.enum(["true", "false"]).default("false");

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    DATABASE_URL: z.string().min(1),
    REDIS_URL: z.string().min(1),
    NEXTAUTH_SECRET: z.string().min(32),
    NEXTAUTH_URL: z.string().url().optional(),
    APP_BASE_URL: z.string().url(),
    TOKEN_ENCRYPTION_KEY: z.string().min(1),
    STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
    STORAGE_LOCAL_PATH: z.string().default("./.data/storage"),
    STORAGE_ENDPOINT: z.string().optional(),
    STORAGE_REGION: z.string().default("us-east-1"),
    STORAGE_BUCKET: z.string().optional(),
    STORAGE_ACCESS_KEY: z.string().optional(),
    STORAGE_SECRET_KEY: z.string().optional(),
    STORAGE_FORCE_PATH_STYLE: booleanString,
    STORAGE_SSE: z.string().optional(),
    EMAIL_PROVIDER: z.enum(["mock", "smtp", "resend"]).default("mock"),
    EMAIL_API_KEY: z.string().optional(),
    EMAIL_FROM: z.string().optional(),
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().int().positive().default(587),
    SMTP_USER: z.string().optional(),
    SMTP_PASSWORD: z.string().optional(),
    EMAIL_WEBHOOK_SECRET: z.string().optional(),
    WHATSAPP_ACCESS_TOKEN: z.string().optional(),
    WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
    WHATSAPP_VERIFY_TOKEN: z.string().optional(),
    WHATSAPP_APP_SECRET: z.string().optional(),
    WHATSAPP_API_VERSION: z.string().default("v21.0"),
    WHATSAPP_TEMPLATE_NAME: z.string().default("dividend_statement"),
    WHATSAPP_TEMPLATE_LANG: z.string().default("en"),
    WHATSAPP_RATE_LIMIT_PER_SECOND: z.coerce.number().int().positive().default(20),
    MAX_UPLOAD_SIZE_MB: z.coerce.number().positive().default(2048),
    MAX_CAMPAIGN_PDF_MB: z.coerce.number().positive().max(500).default(100),
    CAMPAIGN_PDF_CONCURRENCY: z.coerce.number().int().positive().max(8).default(2),
    PDF_GENERATION_TIMEOUT_MS: z.coerce.number().int().positive().max(600_000).default(120_000),
    CAMPAIGN_TEMP_MAX_AGE_MINUTES: z.coerce.number().int().positive().max(1440).default(30),
    DEFAULT_LINK_EXPIRY_DAYS: z.coerce.number().int().positive().max(3650).default(30),
    VERIFICATION_SESSION_TTL_MINUTES: z.coerce.number().int().positive().max(1440).default(15),
    MAX_VERIFICATION_ATTEMPTS: z.coerce.number().int().positive().max(20).default(5),
    VERIFICATION_LOCKOUT_MINUTES: z.coerce.number().int().positive().max(1440).default(15),
    MOCK_EMAIL_ENABLED: booleanString,
    MOCK_WHATSAPP_ENABLED: booleanString,
    WORKER_CONCURRENCY: z.coerce.number().int().positive().max(32).default(4),
    ORIGINAL_RETENTION_DAYS: z.coerce.number().int().positive().default(30),
    ENCRYPTED_RETENTION_DAYS: z.coerce.number().int().positive().default(365),
    EXPORT_RETENTION_HOURS: z.coerce.number().int().positive().default(24),
    MAX_ZIP_ENTRIES: z.coerce.number().int().positive().default(20000),
    MAX_UNCOMPRESSED_MB: z.coerce.number().positive().default(8192),
    MAX_COMPRESSION_RATIO: z.coerce.number().positive().default(100),
    PDF_ENCRYPTION_BITS: z.enum(["128", "256"]).default("256"),
    PDF_PASSWORD_POLICY: z.enum(["folio"]).default("folio"),
    DEFAULT_PHONE_REGION: z.string().length(2).default("PK"),
    FOLIO_GLOBALLY_UNIQUE: booleanString,
    QPDF_BIN: z.string().default("qpdf"),
    LOGIN_RATE_LIMIT: z.coerce.number().int().positive().default(10),
    VERIFY_RATE_LIMIT: z.coerce.number().int().positive().default(20),
    DOWNLOAD_RATE_LIMIT: z.coerce.number().int().positive().default(30),
    RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().positive().default(900),
    ADMIN_SESSION_HOURS: z.coerce.number().int().positive().max(24).default(8),
    DEV_MAILBOX_PATH: z.string().default("./.data/mailbox"),
  })
  .superRefine((value, ctx) => {
    const key = decodeKey(value.TOKEN_ENCRYPTION_KEY);
    if (!key) {
      ctx.addIssue({
        code: "custom",
        path: ["TOKEN_ENCRYPTION_KEY"],
        message: "TOKEN_ENCRYPTION_KEY must be base64 for exactly 32 bytes",
      });
    }

    if (value.STORAGE_DRIVER === "s3") {
      for (const field of ["STORAGE_ENDPOINT", "STORAGE_BUCKET", "STORAGE_ACCESS_KEY", "STORAGE_SECRET_KEY"] as const) {
        if (!value[field]) {
          ctx.addIssue({ code: "custom", path: [field], message: `${field} is required when STORAGE_DRIVER=s3` });
        }
      }
    }

    if (value.EMAIL_PROVIDER === "smtp" && (!value.SMTP_HOST || !value.EMAIL_FROM)) {
      ctx.addIssue({
        code: "custom",
        path: ["SMTP_HOST"],
        message: "SMTP_HOST and EMAIL_FROM are required when EMAIL_PROVIDER=smtp",
      });
    }

    if (value.EMAIL_PROVIDER === "resend" && (!value.EMAIL_API_KEY || !value.EMAIL_FROM)) {
      ctx.addIssue({
        code: "custom",
        path: ["EMAIL_API_KEY"],
        message: "EMAIL_API_KEY and EMAIL_FROM are required when EMAIL_PROVIDER=resend",
      });
    }

    if (value.NODE_ENV !== "production") return;

    if (value.MOCK_EMAIL_ENABLED === "true" || value.MOCK_WHATSAPP_ENABLED === "true" || value.EMAIL_PROVIDER === "mock") {
      ctx.addIssue({
        code: "custom",
        path: ["MOCK_EMAIL_ENABLED"],
        message: "Mock email or WhatsApp delivery cannot be enabled in production",
      });
    }

    if (value.STORAGE_DRIVER !== "s3") {
      ctx.addIssue({
        code: "custom",
        path: ["STORAGE_DRIVER"],
        message: "Production must use private S3-compatible storage",
      });
    }

    if (DEV_AUTH_SECRETS.has(value.NEXTAUTH_SECRET) || value.NEXTAUTH_SECRET.includes("dev-only")) {
      ctx.addIssue({
        code: "custom",
        path: ["NEXTAUTH_SECRET"],
        message: "Replace the development authentication secret before production",
      });
    }

    if (key && (DEV_TOKEN_KEYS.has(value.TOKEN_ENCRYPTION_KEY) || key.equals(Buffer.alloc(32)))) {
      ctx.addIssue({
        code: "custom",
        path: ["TOKEN_ENCRYPTION_KEY"],
        message: "Replace the development token encryption key before production",
      });
    }

    if (value.STORAGE_ACCESS_KEY === "replace-me" || value.STORAGE_SECRET_KEY === "replace-me") {
      ctx.addIssue({
        code: "custom",
        path: ["STORAGE_ACCESS_KEY"],
        message: "Replace placeholder storage credentials before production",
      });
    }
  });

export type AppEnv = z.infer<typeof envSchema> & {
  tokenEncryptionKey: Buffer;
};

function decodeKey(value: string): Buffer | null {
  try {
    const key = Buffer.from(value, "base64");
    if (key.length !== 32) return null;
    return key;
  } catch {
    return null;
  }
}

export function parseEnv(source: Record<string, string | undefined>): AppEnv {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => `${issue.path.join(".") || "env"}: ${issue.message}`).join("\n");
    throw new Error(`Environment configuration is invalid.\n${details}`);
  }
  const tokenEncryptionKey = decodeKey(parsed.data.TOKEN_ENCRYPTION_KEY);
  if (!tokenEncryptionKey) {
    throw new Error("TOKEN_ENCRYPTION_KEY must be base64 for exactly 32 bytes");
  }
  return { ...parsed.data, tokenEncryptionKey };
}

let cached: AppEnv | null = null;

export function getEnv(): AppEnv {
  if (!cached) cached = parseEnv(process.env);
  return cached;
}

export function resetEnvCache(): void {
  cached = null;
}

export function assertEnv(): AppEnv {
  return getEnv();
}

export function isProduction(): boolean {
  return getEnv().NODE_ENV === "production";
}
