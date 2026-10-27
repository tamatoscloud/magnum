import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { listCampaigns } from "@/server/services/campaign-service";

export default async function CampaignsPage() {
  const data = await listCampaigns(1);
  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-sm text-brass">Annual reports</p>
          <h1 className="font-serif text-4xl">Campaigns</h1>
        </div>
        <Link href="/admin/campaigns/new" className="rounded-full bg-ink px-4 py-2 text-sm text-paper">
          New campaign
        </Link>
      </div>
      <div className="overflow-hidden rounded-3xl border border-line bg-card">
        <table className="w-full text-left text-sm">
          <thead className="bg-paper text-ink-soft">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Roster</th>
              <th className="px-4 py-3 font-medium">Created</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((campaign) => (
              <tr key={campaign.id} className="border-t border-line">
                <td className="px-4 py-3">
                  <Link href={`/admin/campaigns/${campaign.id}`} className="font-medium">{campaign.name}</Link>
                  <p className="text-xs text-ink-soft">{campaign.createdBy.name}</p>
                </td>
                <td className="px-4 py-3"><Badge value={campaign.status} /></td>
                <td className="px-4 py-3">{campaign._count.members}</td>
                <td className="px-4 py-3">{campaign.createdAt.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {data.items.length === 0 ? <p className="px-4 py-6 text-sm text-ink-soft">No annual-report campaigns yet.</p> : null}
      </div>
    </div>
  );
}
