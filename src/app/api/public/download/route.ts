import { cookies } from "next/headers";
import { Readable } from "node:stream";
import { writeAudit } from "@/lib/audit/log";
import { toErrorResponse } from "@/lib/http";
import { createStorage } from "@/lib/storage";
import { PORTAL_COOKIE, authorizeDownload } from "@/server/services/verification-service";

export async function GET(request: Request): Promise<Response> {
  try {
    const jar = await cookies();
    const rawSession = jar.get(PORTAL_COOKIE)?.value;
    const forwarded = request.headers.get("x-forwarded-for");
    const ip = forwarded?.split(",")[0]?.trim() || "unknown";
    const authorized = await authorizeDownload(rawSession, ip);
    await writeAudit({
      actorType: "CUSTOMER",
      action: "portal.download",
      entityType: "Customer",
      entityId: authorized.customerId,
      result: "success",
      metadata: { linkId: authorized.linkId },
    });
    const stream = await createStorage().open(authorized.storageKey);
    return new Response(Readable.toWeb(stream) as ReadableStream, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'attachment; filename="dividend-statement.pdf"',
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
