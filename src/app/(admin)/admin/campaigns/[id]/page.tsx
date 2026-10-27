import { notFound } from "next/navigation";
import { CampaignManager } from "@/components/campaigns/campaign-manager";
import { Badge } from "@/components/ui/badge";
import { can } from "@/lib/auth/permissions";
import { getCurrentUser } from "@/lib/http";
import { campaignCsvPreview, getCampaignDetail } from "@/server/services/campaign-service";
import { AppError } from "@/lib/errors";

export default async function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) notFound();
  const { id } = await params;
  let detail: Awaited<ReturnType<typeof getCampaignDetail>>;
  try {
    detail = await getCampaignDetail(id);
  } catch (error) {
    if (error instanceof AppError && error.status === 404) notFound();
    throw error;
  }
  const { campaign, downloads } = detail;
  const preview = await campaignCsvPreview(campaign.id);
  const mapping = preview.suggestedMapping as Record<string, string>;
  const headers = preview.headers;
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-brass">Shared annual report</p>
          <h1 className="font-serif text-4xl">{campaign.name}</h1>
        </div>
        <Badge value={campaign.status} />
      </div>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Roster" value={campaign._count.members} />
        <Stat label="Valid rows" value={campaign.validRecords} />
        <Stat label="Invalid rows" value={campaign.invalidRecords} />
        <Stat label="Source PDF" value={campaign.sourceSha256 ? "Stored" : "Missing"} />
      </section>
      <section className="rounded-3xl border border-line bg-card p-5">
        <h2 className="font-serif text-2xl">Downloads</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {Object.keys(downloads).length === 0 ? <li className="text-ink-soft">No download attempts yet.</li> : null}
          {Object.entries(downloads).map(([outcome, count]) => (
            <li key={outcome} className="flex justify-between"><span>{outcome}</span><span>{count}</span></li>
          ))}
        </ul>
      </section>
      <CampaignManager
        campaignId={campaign.id}
        status={campaign.status}
        headers={headers}
        suggestedMapping={mapping}
        canActivate={can(user.role, "campaigns:activate")}
        canReveal={can(user.role, "campaigns:reveal")}
      />
      <section className="rounded-3xl border border-line bg-card p-5">
        <h2 className="font-serif text-2xl">Validation</h2>
        {campaign.issues.length === 0 ? <p className="mt-3 text-sm text-ink-soft">No validation issues.</p> : null}
        <ul className="mt-3 space-y-2 text-sm">
          {campaign.issues.map((issue) => (
            <li key={issue.id}>
              <Badge value={issue.severity} />{" "}
              <span>{issue.rowNumber ? `Row ${issue.rowNumber}: ` : ""}{issue.message}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <article className="rounded-3xl border border-line bg-card p-5">
      <p className="text-sm text-ink-soft">{label}</p>
      <p className="mt-2 font-serif text-3xl">{value}</p>
    </article>
  );
}
