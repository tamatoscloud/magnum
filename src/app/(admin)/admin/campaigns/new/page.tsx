import { NewCampaignForm } from "@/components/campaigns/new-campaign-form";
import { getRuntimeSettings } from "@/server/services/settings-service";

export default async function NewCampaignPage() {
  const settings = await getRuntimeSettings();
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-brass">Annual reports</p>
        <h1 className="font-serif text-4xl">New campaign</h1>
        <p className="mt-2 max-w-2xl text-sm text-ink-soft">
          One source PDF is shared by every customer in the roster. Each customer opens the same URL and receives a copy encrypted with their folio number.
        </p>
      </div>
      <NewCampaignForm defaultExpiry={settings.defaultLinkExpiryDays} />
    </div>
  );
}
