import { assertSameOrigin, json, requirePermission, toErrorResponse } from "@/lib/http";
import { getEnv } from "@/lib/env";
import { discardUpload, parseMultipartUpload } from "@/server/services/batch-service";
import { storeCampaignCsv } from "@/server/services/campaign-service";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  let upload: Awaited<ReturnType<typeof parseMultipartUpload>> | null = null;
  try {
    assertSameOrigin(request);
    const user = await requirePermission("campaigns:create");
    const { id } = await context.params;
    upload = await parseMultipartUpload(request, getEnv().MAX_UPLOAD_SIZE_MB * 1024 * 1024);
    const file = upload.files.csv ?? Object.values(upload.files)[0];
    if (!file || !file.filename.toLowerCase().endsWith(".csv")) {
      return json({ error: "The customer file must use a .csv extension." }, 400);
    }
    return json(await storeCampaignCsv(id, file.path, file.filename, user.id));
  } catch (error) {
    if (error instanceof Error && /CSV|UTF-8|header row/.test(error.message)) return json({ error: error.message }, 400);
    return toErrorResponse(error);
  } finally {
    if (upload) await discardUpload(upload);
  }
}
