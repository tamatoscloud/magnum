import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { can } from "@/lib/auth/permissions";
import { getCurrentUser } from "@/lib/http";
import { maskEmail, maskPhone } from "@/lib/security/mask";
import { prisma } from "@/lib/db/prisma";
import { searchCustomers } from "@/server/repositories/admin-queries";

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; batchId?: string; processingStatus?: string; linkStatus?: string; page?: string }>;
}) {
  const params = await searchParams;
  const user = await getCurrentUser();
  const reveal = user ? can(user.role, "customers:read_sensitive") : false;
  const page = Math.max(1, Number(params.page ?? "1") || 1);
  const [data, batches] = await Promise.all([
    searchCustomers({
      q: params.q,
      batchId: params.batchId,
      processingStatus: params.processingStatus,
      linkStatus: params.linkStatus,
      page,
    }),
    prisma.importBatch.findMany({ select: { id: true, batchName: true }, orderBy: { createdAt: "desc" }, take: 100 }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-brass">Records</p>
        <h1 className="font-serif text-4xl">Customers</h1>
      </div>
      <form className="grid gap-3 lux-card rounded-3xl border border-line bg-card p-4 md:grid-cols-4">
        <input name="q" defaultValue={params.q} placeholder="Name, folio, email, phone" className="rounded-xl border border-line px-3 py-2 text-sm" />
        <select name="batchId" defaultValue={params.batchId ?? ""} className="rounded-xl border border-line px-3 py-2 text-sm">
          <option value="">All batches</option>
          {batches.map((batch) => (
            <option key={batch.id} value={batch.id}>{batch.batchName}</option>
          ))}
        </select>
        <select name="processingStatus" defaultValue={params.processingStatus ?? ""} className="rounded-xl border border-line px-3 py-2 text-sm">
          <option value="">Any document</option>
          {["PENDING", "PROCESSING", "ENCRYPTED", "FAILED", "QUARANTINED"].map((status) => (
            <option key={status} value={status}>{status}</option>
          ))}
        </select>
        <button className="inline-flex items-center justify-center rounded-full border border-ink bg-ink px-5 py-2.5 text-sm font-semibold tracking-wide text-paper shadow-sm transition-all duration-200 hover:border-gold hover:bg-ink-deep hover:text-gold focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2" type="submit">Search</button>
      </form>
      <div className="overflow-x-auto lux-card rounded-3xl border border-line bg-card">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-paper text-ink-soft">
            <tr>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Folio</th>
              <th className="px-4 py-3">Contact</th>
              <th className="px-4 py-3">Document</th>
              <th className="px-4 py-3">Link</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((customer) => (
              <tr key={customer.id} className="border-t border-line">
                <td className="px-4 py-3">
                  <Link href={`/admin/customers/${customer.id}`} className="font-medium">{customer.customerName}</Link>
                  <p className="text-xs text-ink-soft">{customer.batch.batchName}</p>
                </td>
                <td className="px-4 py-3">{reveal ? customer.folioNumber : maskFolio(customer.folioNumber)}</td>
                <td className="px-4 py-3">
                  <p>{maskEmail(customer.email, reveal)}</p>
                  <p className="text-xs text-ink-soft">{maskPhone(customer.phoneNumber, reveal)}</p>
                </td>
                <td className="px-4 py-3">{customer.document ? <Badge value={customer.document.processingStatus} /> : "—"}</td>
                <td className="px-4 py-3">{customer.accessLinks[0] ? <Badge value={customer.accessLinks[0].status} /> : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {data.items.length === 0 ? <p className="px-4 py-6 text-sm text-ink-soft">No customers match.</p> : null}
      </div>
    </div>
  );
}

function maskFolio(value: string): string {
  if (value.length <= 4) return "••••";
  return `${value.slice(0, 2)}•••${value.slice(-2)}`;
}
