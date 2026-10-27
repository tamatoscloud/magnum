import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { BatchActions } from "@/components/batches/batch-actions";
import { BatchPoller } from "@/components/batches/batch-poller";
import { can } from "@/lib/auth/permissions";
import { getCurrentUser } from "@/lib/http";
import { getBatchDetail } from "@/server/repositories/admin-queries";

export default async function BatchDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [user, batch] = await Promise.all([getCurrentUser(), getBatchDetail(id)]);
  if (!user || !batch) notFound();
  const live = batch.status === "VALIDATING" || batch.status === "PROCESSING";
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-brass">{batch.originalCsvFilename}</p>
          <h1 className="font-serif text-4xl">{batch.batchName}</h1>
        </div>
        <Badge value={batch.status} />
      </div>
      {live ? <BatchPoller /> : null}
      <section className="grid gap-3 sm:grid-cols-4">
        {[
          ["Rows", batch.totalRecords],
          ["Valid", batch.validRecords],
          ["Invalid", batch.invalidRecords],
          ["Encrypted", batch.processedRecords],
        ].map(([label, value]) => (
          <article key={String(label)} className="rounded-2xl border border-line bg-card p-4">
            <p className="text-xs text-ink-soft">{label}</p>
            <p className="font-serif text-2xl">{value}</p>
          </article>
        ))}
      </section>
      {batch.errorSummary ? <p className="rounded-2xl bg-[#f8e4e4] px-4 py-3 text-sm text-danger">{batch.errorSummary}</p> : null}
      <BatchActions
        batchId={batch.id}
        canProcess={batch.status === "READY" && can(user.role, "batches:process")}
        canCancel={["UPLOADED", "VALIDATING", "READY", "PROCESSING"].includes(batch.status) && can(user.role, "batches:cancel")}
        canRetry={can(user.role, "batches:retry") && batch.failedRecords > 0}
        canExport={can(user.role, "reports:export") && batch.processedRecords > 0}
      />
      <section className="overflow-hidden rounded-3xl border border-line bg-card">
        <h2 className="px-4 py-3 font-serif text-2xl">Validation</h2>
        <table className="w-full text-left text-sm">
          <thead className="bg-paper text-ink-soft">
            <tr>
              <th className="px-4 py-2">Row</th>
              <th className="px-4 py-2">Field</th>
              <th className="px-4 py-2">Issue</th>
            </tr>
          </thead>
          <tbody>
            {batch.validationIssues.map((issue) => (
              <tr key={issue.id} className="border-t border-line">
                <td className="px-4 py-2">{issue.rowNumber ?? "—"}</td>
                <td className="px-4 py-2">{issue.field ?? "—"}</td>
                <td className="px-4 py-2">
                  <Badge value={issue.severity} /> <span className="ml-2">{issue.message}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {batch.validationIssues.length === 0 ? <p className="px-4 py-4 text-sm text-ink-soft">No validation issues loaded yet.</p> : null}
      </section>
    </div>
  );
}
