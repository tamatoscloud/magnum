import { Badge } from "@/components/ui/badge";
import { listAuditLogs } from "@/server/repositories/admin-queries";

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ page?: string; action?: string; entityType?: string }> }) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page ?? "1") || 1);
  const data = await listAuditLogs({ page, action: params.action, entityType: params.entityType });
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-brass">History</p>
        <h1 className="font-serif text-4xl">Audit logs</h1>
      </div>
      <form className="flex flex-wrap gap-2">
        <input name="action" defaultValue={params.action} placeholder="Action" className="rounded-xl border border-line bg-card px-3 py-2 text-sm" />
        <input name="entityType" defaultValue={params.entityType} placeholder="Entity" className="rounded-xl border border-line bg-card px-3 py-2 text-sm" />
        <button className="rounded-full bg-ink px-4 py-2 text-sm text-paper" type="submit">Filter</button>
      </form>
      <div className="overflow-x-auto rounded-3xl border border-line bg-card">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-paper text-ink-soft">
            <tr>
              <th className="px-4 py-3">When</th>
              <th className="px-4 py-3">Actor</th>
              <th className="px-4 py-3">Action</th>
              <th className="px-4 py-3">Entity</th>
              <th className="px-4 py-3">Result</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((log) => (
              <tr key={log.id} className="border-t border-line align-top">
                <td className="px-4 py-3">{log.createdAt.toLocaleString()}</td>
                <td className="px-4 py-3">{log.actorType}</td>
                <td className="px-4 py-3">{log.action}</td>
                <td className="px-4 py-3">{log.entityType}</td>
                <td className="px-4 py-3"><Badge value={log.result === "success" ? "COMPLETED" : "FAILED"} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
