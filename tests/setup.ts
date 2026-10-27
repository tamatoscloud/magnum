import { existsSync } from "node:fs";
import path from "node:path";

Reflect.set(process.env, "NODE_ENV", "test");
process.env.DATABASE_URL ??= "postgresql://magnum:magnum@127.0.0.1:5433/magnum";
process.env.REDIS_URL ??= "redis://localhost:6379";
process.env.NEXTAUTH_SECRET ??= "test-only-nextauth-secret-32-characters";
process.env.NEXTAUTH_URL ??= "http://localhost:3000";
process.env.APP_BASE_URL ??= "http://localhost:3000";
process.env.TOKEN_ENCRYPTION_KEY ??= Buffer.from("dev-only-token-key-not-for-prod!").toString("base64");
process.env.STORAGE_DRIVER ??= "local";
process.env.STORAGE_LOCAL_PATH ??= "./.data/test-storage";
process.env.EMAIL_PROVIDER ??= "mock";
process.env.MOCK_EMAIL_ENABLED ??= "true";
process.env.MOCK_WHATSAPP_ENABLED ??= "true";
process.env.RATE_LIMIT_MEMORY ??= "true";

const bundledQpdf = path.join(process.cwd(), ".data", "qpdf", "qpdf-12.4.2-msvc64", "bin", process.platform === "win32" ? "qpdf.exe" : "qpdf");
if (!process.env.QPDF_BIN && existsSync(bundledQpdf)) {
  process.env.QPDF_BIN = bundledQpdf;
}
