import { describe, expect, it } from "vitest";
import { parseEnv } from "@/lib/env";

const valid = {
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://user:pass@db:5432/magnum",
  REDIS_URL: "redis://redis:6379",
  NEXTAUTH_SECRET: "production-secret-value-with-32-chars-min",
  APP_BASE_URL: "https://portal.example",
  TOKEN_ENCRYPTION_KEY: Buffer.from("prod-token-key-must-be-32-bytes!").toString("base64"),
  STORAGE_DRIVER: "s3",
  STORAGE_ENDPOINT: "https://s3.example",
  STORAGE_BUCKET: "statements",
  STORAGE_ACCESS_KEY: "real-access-key",
  STORAGE_SECRET_KEY: "real-secret-key",
  EMAIL_PROVIDER: "resend",
  EMAIL_API_KEY: "re_test",
  EMAIL_FROM: "Magnum <statements@example.com>",
  MOCK_EMAIL_ENABLED: "false",
  MOCK_WHATSAPP_ENABLED: "false",
};

describe("production environment guard", () => {
  it("rejects mock delivery in production", () => {
    expect(() => parseEnv({ ...valid, MOCK_EMAIL_ENABLED: "true" })).toThrow(/Mock email or WhatsApp/);
    expect(() => parseEnv({ ...valid, EMAIL_PROVIDER: "mock" })).toThrow(/Mock email or WhatsApp/);
  });

  it("rejects local storage and the sample token key in production", () => {
    expect(() => parseEnv({ ...valid, STORAGE_DRIVER: "local" })).toThrow(/S3-compatible/);
    expect(() =>
      parseEnv({
        ...valid,
        TOKEN_ENCRYPTION_KEY: Buffer.from("dev-only-token-key-not-for-prod!").toString("base64"),
      }),
    ).toThrow(/development token encryption key/);
  });
});
