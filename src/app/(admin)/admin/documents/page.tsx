import { Badge } from "@/components/ui/badge";
import { DocumentRetry } from "@/components/documents/document-retry";
import { can } from "@/lib/auth/permissions";
import { getCurrentUser } from "@/lib/http";
import { listDocuments } from "@/server/repositories/admin-queries";

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<{ page?: string; status?: string }> }) {
  const params = await searchParams;
  const user = await getCurrentUser();
  const page = Math.max(1, Number(params.page ?? "1") || 1);
  const data = await listDocuments(page, params.status);
  const allowRetry = user ? can(user.role, "documents:retry") : false;
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-brass">Files</p>
        <h1 className="font-serif text-4xl">Documents</h1>
      </div>
      <form className="flex gap-2">
        <select name="status" defaultValue={params.status ?? ""} className="rounded-xl border border-line bg-card px-3 py-2 text-sm">
          <option value="">All statuses</option>
          {["PENDING", "PROCESSING", "ENCRYPTED", "FAILED", "QUARANTINED"].map((status) => (
            <option key={status} value={status}>{status}</option>
          ))}
        </select>
        <button className="rounded-full bg-ink px-4 py-2 text-sm text-paper" type="submit">Filter</button>
      </form>
      <div className="overflow-x-auto rounded-3xl border border-line bg-card">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-paper text-ink-soft">
            <tr>
              <th className="px-4 py-3">File</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Checksum</th>
              <th className="px-4 py-3">Size</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((document) => (
              <tr key={document.id} className="border-t border-line">
                <td className="px-4 py-3">
                  <p className="font-medium">{document.customer.sourcePdfFilename}</p>
                  <p className="text-xs text-ink-soft">{document.customer.customerName}</p>
                  {document.failureReason ? <p className="text-xs text-danger">{document.failureReason}</p> : null}
                </td>
                <td className="px-4 py-3"><Badge value={document.processingStatus} /></td>
                <td className="px-4 py-3 font-mono text-xs">{document.encryptedSha256?.slice(0, 16) ?? "—"}</td>
                <td className="px-4 py-3">{document.encryptedSizeBytes ?? document.fileSizeBytes ?? "—"}</td>
                <td className="px-4 py-3">
                  {allowRetry && (document.processingStatus === "FAILED" || document.processingStatus === "QUARANTINED") ? (
                    <DocumentRetry id={document.id} />
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
