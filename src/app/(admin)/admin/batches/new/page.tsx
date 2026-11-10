import { UploadWizard } from "@/components/batches/upload-wizard";
import { getRuntimeSettings } from "@/server/services/settings-service";

export default async function NewBatchPage() {
  const settings = await getRuntimeSettings();
  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-brass">Import</p>
        <h1 className="font-serif text-4xl">Upload a batch</h1>
      </div>
      <UploadWizard
        defaultExpiry={settings.defaultLinkExpiryDays}
        notifyEmail={settings.notifyEmailDefault}
        notifyWhatsapp={settings.notifyWhatsappDefault}
      />
    </div>
  );
}
