import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { dashboardStats } from "@/server/repositories/admin-queries";

export default async function DashboardPage() {
  const stats = await dashboardStats();
  const cards = [
    ["Batches", stats.batches],
    ["Customers", stats.customers],
    ["Encrypted documents", stats.documents],
    ["Failed or invalid records", stats.failedRecords],
    ["Active links", stats.activeLinks],
  ];
  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm text-brass">Distribution</p>
        <h1 className="font-serif text-4xl">Dashboard</h1>
      </div>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {cards.map(([label, value]) => (
          <article key={String(label)} className="rounded-3xl border border-line bg-card p-5">
            <p className="text-sm text-ink-soft">{label}</p>
            <p className="mt-2 font-serif text-3xl">{value}</p>
          </article>
        ))}
      </section>
      <section className="grid gap-4 md:grid-cols-2">
        <DeliveryCard title="Email" counts={stats.email} />
        <DeliveryCard title="WhatsApp" counts={stats.whatsapp} />
      </section>
      <section className="rounded-3xl border border-line bg-card p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-serif text-2xl">Recent batches</h2>
          <Link href="/admin/batches/new" className="text-sm text-brass">
            New batch
          </Link>
        </div>
        <div className="divide-y divide-line">
          {stats.recent.length === 0 ? <p className="text-sm text-ink-soft">No batches yet.</p> : null}
          {stats.recent.map((batch) => (
            <Link key={batch.id} href={`/admin/batches/${batch.id}`} className="flex items-center justify-between gap-4 py-3">
              <span>
                <span className="block font-medium">{batch.batchName}</span>
                <span className="text-xs text-ink-soft">{batch.processedRecords}/{batch.validRecords || batch.totalRecords} processed</span>
              </span>
              <Badge value={batch.status} />
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

function DeliveryCard({ title, counts }: { title: string; counts: Record<string, number> }) {
  const entries = Object.entries(counts);
  return (
    <article className="rounded-3xl border border-line bg-card p-5">
      <h2 className="font-serif text-2xl">{title}</h2>
      {entries.length === 0 ? <p className="mt-3 text-sm text-ink-soft">No delivery attempts yet.</p> : null}
      <ul className="mt-3 space-y-2 text-sm">
        {entries.map(([status, count]) => (
          <li key={status} className="flex items-center justify-between">
            <Badge value={status} />
            <span>{count}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}
