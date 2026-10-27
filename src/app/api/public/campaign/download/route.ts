import { cookies } from "next/headers";
import { toErrorResponse } from "@/lib/http";
import { CAMPAIGN_COOKIE, openCampaignDownload, streamEncryptedReport } from "@/server/services/campaign-portal";

export async function GET(request: Request): Promise<Response> {
  try {
    const jar = await cookies();
    const forwarded = request.headers.get("x-forwarded-for");
    const opened = await openCampaignDownload(jar.get(CAMPAIGN_COOKIE)?.value, forwarded?.split(",")[0]?.trim() || "unknown");
    const stream = streamEncryptedReport(opened);
    return new Response(stream, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'attachment; filename="annual-report.pdf"',
        "Cache-Control": "private, no-store, max-age=0",
        Pragma: "no-cache",
        "Surrogate-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
