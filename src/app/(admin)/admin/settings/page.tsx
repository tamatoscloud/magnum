import { SettingsForm } from "@/components/admin/settings-form";
import { can } from "@/lib/auth/permissions";
import { getCurrentUser } from "@/lib/http";
import { getRuntimeSettings, providerStatus } from "@/server/services/settings-service";
import { QueuePanel } from "@/components/admin/queue-panel";

export default async function SettingsPage() {
  const [user, settings, providers] = await Promise.all([getCurrentUser(), getRuntimeSettings(), Promise.resolve(providerStatus())]);
  if (!user) return null;
  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-brass">Configuration</p>
        <h1 className="font-serif text-4xl">Settings</h1>
      </div>
      <section className="lux-card rounded-3xl border border-line bg-card p-5">
        <h2 className="font-serif text-2xl">Providers</h2>
        <dl className="mt-4 grid gap-3 text-sm md:grid-cols-2">
          <div><dt className="text-ink-soft">Email</dt><dd>{providers.email}</dd></div>
          <div><dt className="text-ink-soft">WhatsApp</dt><dd>{providers.whatsapp}</dd></div>
          <div><dt className="text-ink-soft">Storage</dt><dd>{providers.storage}</dd></div>
          <div><dt className="text-ink-soft">PDF password</dt><dd>{providers.pdfPasswordPolicy}, AES-{providers.pdfEncryptionBits}</dd></div>
        </dl>
        <p className="mt-4 text-xs text-ink-soft">Provider secrets stay in environment variables and are never shown again after configuration.</p>
      </section>
      <section className="lux-card rounded-3xl border border-line bg-card p-5">
        <h2 className="mb-4 font-serif text-2xl">Defaults</h2>
        <SettingsForm initial={settings} canWrite={can(user.role, "settings:write")} />
      </section>
      {can(user.role, "queues:read") ? <QueuePanel /> : null}
    </div>
  );
}
