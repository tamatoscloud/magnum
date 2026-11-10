import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/auth-options";
import { can, type Permission } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";
import { getEnv } from "@/lib/env";
import { AppError } from "@/lib/errors";

export async function getCurrentUser() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;
  const user = await prisma.adminUser.findUnique({ where: { id: session.user.id } });
  if (!user?.isActive) return null;
  return user;
}

export async function requirePermission(permission: Permission) {
  const user = await getCurrentUser();
  if (!user) throw new AppError("Sign in required.", 401, "unauthorized");
  if (!can(user.role, permission)) throw new AppError("You do not have access to this action.", 403, "forbidden");
  return user;
}

export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (!origin) return;
  const env = getEnv();
  const expected = new URL(env.APP_BASE_URL).origin;
  if (origin === expected) return;
  // Development only: also accept the app opened directly on this machine (http://localhost:<port>),
  // so it can be used locally while APP_BASE_URL points at a public tunnel address.
  if (env.NODE_ENV !== "production") {
    try {
      const { hostname } = new URL(origin);
      if (hostname === "localhost" || hostname === "127.0.0.1") return;
    } catch {
      // not a valid URL: fall through to the rejection below
    }
  }
  throw new AppError("Invalid origin.", 403, "invalid_origin");
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new AppError("Request body must be JSON.", 400, "invalid_json");
  }
}

export function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

export function toErrorResponse(error: unknown): Response {
  if (error instanceof AppError) {
    return Response.json({ error: error.message, code: error.code }, { status: error.status });
  }
  const name = error instanceof Error ? error.name : "Error";
  console.error(`request failed: ${name}`);
  return Response.json({ error: "Something went wrong.", code: "internal_error" }, { status: 500 });
}
