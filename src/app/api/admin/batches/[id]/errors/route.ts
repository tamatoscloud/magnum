import { issuesToCsv } from "@/lib/csv/evaluate";
import { requirePermission, toErrorResponse } from "@/lib/http";
import { prisma } from "@/lib/db/prisma";
import { AppError } from "@/lib/errors";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    await requirePermission("batches:read");
    const { id } = await context.params;
    const batch = await prisma.importBatch.findUnique({
      where: { id },
      include: { validationIssues: { orderBy: { rowNumber: "asc" } } },
    });
    if (!batch) throw new AppError("Batch not found.", 404, "not_found");
    const csv = issuesToCsv(
      batch.validationIssues.map((issue) => ({
        rowNumber: issue.rowNumber,
        field: issue.field,
        code: issue.code,
        message: issue.message,
        severity: issue.severity,
      })),
    );
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="batch-${id}-errors.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
