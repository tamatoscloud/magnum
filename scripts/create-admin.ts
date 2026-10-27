import "../src/lib/load-env";
import { prisma } from "../src/lib/db/prisma";
import { hashPassword } from "../src/lib/auth/password";
import { getEnv } from "../src/lib/env";
import { randomBytes } from "node:crypto";
import type { AdminRole } from "@prisma/client";

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main(): Promise<void> {
  const env = getEnv();
  const email = arg("email")?.trim().toLocaleLowerCase("en-US");
  const name = arg("name")?.trim();
  const role = (arg("role") ?? "SUPER_ADMIN") as AdminRole;
  if (!email || !name || !["SUPER_ADMIN", "ADMIN", "OPERATOR"].includes(role)) {
    console.error('Usage: pnpm admin:create -- --email admin@example.com --name "Magnum Admin" [--role SUPER_ADMIN]');
    process.exit(1);
  }
  if (env.NODE_ENV === "production" && arg("confirm-production") !== "yes") {
    console.error("Refusing to create a production admin without --confirm-production yes");
    process.exit(1);
  }
  const existing = await prisma.adminUser.findUnique({ where: { email } });
  if (existing) {
    console.error("An admin with that email already exists.");
    process.exit(1);
  }
  const supplied = arg("password");
  const password = supplied && supplied.length >= 12 ? supplied : randomBytes(18).toString("base64url");
  await prisma.adminUser.create({
    data: { email, name, role, passwordHash: await hashPassword(password), isActive: true },
  });
  console.log("Admin created.");
  console.log(`Email: ${email}`);
  console.log(`Password: ${password}`);
  console.log("Store this password now. It will not be shown again.");
  await prisma.$disconnect();
}

main().catch(async (error: unknown) => {
  console.error(error instanceof Error ? error.message : "Unable to create admin");
  await prisma.$disconnect();
  process.exit(1);
});
