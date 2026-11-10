import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { listBatches } from "@/server/repositories/admin-queries";

export default async function BatchesPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page ?? "1") || 1);
  const data = await listBatches(page);
  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-brass">Imports</p>
          <h1 className="font-serif text-4xl">Batches</h1>
        </div>
        <Link href="/admin/batches/new" className="inline-flex items-center justify-center rounded-full border border-ink bg-ink px-5 py-2.5 text-sm font-semibold tracking-wide text-paper shadow-sm transition-all duration-200 hover:border-gold hover:bg-ink-deep hover:text-gold focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2">
          Upload batch
        </Link>
      </div>
      <div className="overflow-hidden lux-card rounded-3xl border border-line bg-card">
        <table className="w-full text-left text-sm">
          <thead className="bg-paper text-ink-soft">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Records</th>
              <th className="px-4 py-3 font-medium">Created</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((batch) => (
              <tr key={batch.id} className="border-t border-line">
                <td className="px-4 py-3">
                  <Link href={`/admin/batches/${batch.id}`} className="font-medium">
                    {batch.batchName}
                  </Link>
                  <p className="text-xs text-ink-soft">{batch.createdBy.name}</p>
                </td>
                <td className="px-4 py-3"><Badge value={batch.status} /></td>
                <td className="px-4 py-3">{batch.validRecords}/{batch.totalRecords}</td>
                <td className="px-4 py-3">{batch.createdAt.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {data.items.length === 0 ? <p className="px-4 py-6 text-sm text-ink-soft">No batches uploaded.</p> : null}
      </div>
    </div>
  );
}
