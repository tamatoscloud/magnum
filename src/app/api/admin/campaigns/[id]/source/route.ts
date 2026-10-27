import { assertSameOrigin, json, requirePermission, toErrorResponse } from "@/lib/http";
import { getEnv } from "@/lib/env";
import { discardUpload, parseMultipartUpload } from "@/server/services/batch-service";
import { storeCampaignSource } from "@/server/services/campaign-service";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  let upload: Awaited<ReturnType<typeof parseMultipartUpload>> | null = null;
  try {
    assertSameOrigin(request);
    const user = await requirePermission("campaigns:create");
    const { id } = await context.params;
    upload = await parseMultipartUpload(request, getEnv().MAX_CAMPAIGN_PDF_MB * 1024 * 1024);
    const file = upload.files.source ?? upload.files.pdf ?? Object.values(upload.files)[0];
    if (!file) return json({ error: "Choose the annual report PDF." }, 400);
    if (!file.filename.toLowerCase().endsWith(".pdf") || file.prefix.subarray(0, 5).toString("utf8") !== "%PDF-") {
      return json({ error: "The annual report must be a PDF." }, 400);
    }
    await storeCampaignSource(id, file.path, user.id);
    return json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  } finally {
    if (upload) await discardUpload(upload);
  }
}
