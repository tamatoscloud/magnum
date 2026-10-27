import { json, requirePermission, toErrorResponse } from "@/lib/http";
import { prisma } from "@/lib/db/prisma";
import { AppError } from "@/lib/errors";
import { createStorage } from "@/lib/storage";
import { Readable } from "node:stream";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    await requirePermission("reports:export");
    const { id } = await context.params;
    const file = await prisma.exportFile.findUnique({ where: { id } });
    if (!file || file.expiresAt.getTime() <= Date.now()) throw new AppError("Report not found.", 404, "not_found");
    if (file.status !== "READY") return json({ status: file.status }, 202);
    const stream = await createStorage().open(file.storageKey);
    return new Response(Readable.toWeb(stream) as ReadableStream, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="batch-links.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
