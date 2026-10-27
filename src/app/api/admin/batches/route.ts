import { z } from "zod";
import { assertSameOrigin, json, requirePermission, toErrorResponse } from "@/lib/http";
import { listBatches } from "@/server/repositories/admin-queries";
import { createUploadedBatch, discardUpload, parseMultipartUpload } from "@/server/services/batch-service";
import { getRuntimeSettings } from "@/server/services/settings-service";

const fieldSchema = z.object({
  batchName: z.string().trim().min(3).max(120),
  linkExpiryDays: z.coerce.number().int().positive().max(3650).optional(),
  notifyEmail: z.enum(["true", "false"]).optional(),
  notifyWhatsapp: z.enum(["true", "false"]).optional(),
});

export async function GET(request: Request): Promise<Response> {
  try {
    await requirePermission("batches:read");
    const page = numberParam(new URL(request.url).searchParams.get("page"));
    return json(await listBatches(page));
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  let upload: Awaited<ReturnType<typeof parseMultipartUpload>> | null = null;
  try {
    assertSameOrigin(request);
    const user = await requirePermission("batches:create");
    const settings = await getRuntimeSettings();
    upload = await parseMultipartUpload(request, settings.maxUploadSizeMb * 1024 * 1024);
    const fields = fieldSchema.parse(upload.fields);
    const csv = upload.files.csv;
    const zip = upload.files.zip;
    if (!csv || !zip) throw new Error("missing files");
    if (!csv.filename.toLowerCase().endsWith(".csv")) {
      return json({ error: "The customer file must use a .csv extension." }, 400);
    }
    if (!zip.filename.toLowerCase().endsWith(".zip") || !isZip(zip.prefix)) {
      return json({ error: "The statement archive must be a .zip file." }, 400);
    }
    const created = await createUploadedBatch({
      batchName: fields.batchName,
      linkExpiryDays: fields.linkExpiryDays ?? settings.defaultLinkExpiryDays,
      notifyEmail: fields.notifyEmail === "true",
      notifyWhatsapp: fields.notifyWhatsapp === "true",
      csvPath: csv.path,
      csvFilename: csv.filename,
      zipPath: zip.path,
      zipFilename: zip.filename,
      createdById: user.id,
    });
    return json(created, 201);
  } catch (error) {
    if (error instanceof z.ZodError) return json({ error: "Check the batch name and upload both files." }, 400);
    if (error instanceof Error && error.message === "missing files") {
      return json({ error: "Choose both a CSV file and a ZIP archive." }, 400);
    }
    if (error instanceof Error && /CSV|UTF-8|header row/.test(error.message)) {
      return json({ error: error.message }, 400);
    }
    return toErrorResponse(error);
  } finally {
    if (upload) await discardUpload(upload);
  }
}

function isZip(prefix: Buffer): boolean {
  return prefix.length >= 4 && prefix[0] === 0x50 && prefix[1] === 0x4b && prefix[2] === 0x03 && prefix[3] === 0x04;
}

function numberParam(value: string | null): number {
  const parsed = Number(value ?? "1");
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 1;
}
