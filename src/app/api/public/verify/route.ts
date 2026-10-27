import { z } from "zod";
import { cookies } from "next/headers";
import { json, readJson, toErrorResponse } from "@/lib/http";
import { getEnv } from "@/lib/env";
import { PORTAL_COOKIE, verifyCustomerIdentity } from "@/server/services/verification-service";

const schema = z.object({
  token: z.string().trim().min(20).max(300),
  customerName: z.string().trim().min(2).max(200),
  folioNumber: z.string().trim().min(1).max(64),
});

export async function POST(request: Request): Promise<Response> {
  try {
    const parsed = schema.safeParse(await readJson(request));
    if (!parsed.success) return json({ error: "Enter your full name and folio number." }, 400);
    const ip = clientIp(request);
    const result = await verifyCustomerIdentity({
      rawToken: parsed.data.token,
      customerName: parsed.data.customerName,
      folioNumber: parsed.data.folioNumber,
      ip,
    });
    if (!result.ok) return json({ error: result.message }, result.status);
    const jar = await cookies();
    jar.set(PORTAL_COOKIE, result.sessionToken, {
      httpOnly: true,
      secure: getEnv().NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: result.maxAgeSeconds,
    });
    return json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}

function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "unknown";
  return "unknown";
}
