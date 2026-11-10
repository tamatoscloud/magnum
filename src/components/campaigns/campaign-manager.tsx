"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

const FIELDS = [
  ["customer_name", "Customer name"],
  ["folio_number", "Folio number"],
  ["email", "Email (optional column)"],
  ["phone_number", "Phone (optional column)"],
] as const;

export function CampaignManager({
  campaignId,
  status,
  headers,
  suggestedMapping,
  canActivate,
  canReveal,
}: {
  campaignId: string;
  status: string;
  headers: string[];
  suggestedMapping: Record<string, string>;
  canActivate: boolean;
  canReveal: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>(suggestedMapping);
  const [localHeaders, setLocalHeaders] = useState<string[] | null>(null);
  const csvHeaders = localHeaders ?? headers;
  const [sharedUrl, setSharedUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const editable = status === "DRAFT" || status === "READY";

  async function send(url: string, body?: BodyInit, method = "POST") {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(url, {
        method,
        body,
        headers: typeof body === "string" ? { "Content-Type": "application/json" } : undefined,
      });
      const payload = (await response.json()) as { error?: string; url?: string; headers?: string[]; suggestedMapping?: Record<string, string>; warning?: string };
      if (!response.ok) {
        setError(payload.error ?? "The request failed.");
        return payload;
      }
      if (payload.warning) setError(payload.warning);
      router.refresh();
      return payload;
    } catch {
      setError("The request failed.");
      return {};
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {editable ? (
        <section className="grid gap-4 md:grid-cols-2">
          <form
            className="space-y-3 lux-card rounded-3xl border border-line bg-card p-5"
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              void send(`/api/admin/campaigns/${campaignId}/source`, data);
            }}
          >
            <h2 className="font-serif text-2xl">Source PDF</h2>
            <p className="text-sm text-ink-soft">Upload the annual report once. Every verified customer receives an encrypted copy of this file.</p>
            <input name="source" type="file" accept="application/pdf,.pdf" required className="text-sm" />
            <Button type="submit" disabled={busy}>Upload PDF</Button>
          </form>
          <form
            className="space-y-3 lux-card rounded-3xl border border-line bg-card p-5"
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              void send(`/api/admin/campaigns/${campaignId}/csv`, data).then((payload) => {
                if (payload.headers) setLocalHeaders(payload.headers);
                if (payload.suggestedMapping) setMapping(payload.suggestedMapping);
              });
            }}
          >
            <h2 className="font-serif text-2xl">Customer CSV</h2>
            <p className="text-sm text-ink-soft">Name and folio are required. Email and phone can be left blank.</p>
            <input name="csv" type="file" accept=".csv,text/csv" required className="text-sm" />
            <Button type="submit" disabled={busy}>Upload CSV</Button>
          </form>
        </section>
      ) : null}

      {editable && csvHeaders.length > 0 ? (
        <form
          className="space-y-4 lux-card rounded-3xl border border-line bg-card p-5"
          onSubmit={(event) => {
            event.preventDefault();
            void send(`/api/admin/campaigns/${campaignId}/validate`, JSON.stringify({ mapping }), "POST").then(() => undefined);
          }}
        >
          <h2 className="font-serif text-2xl">Column mapping</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {FIELDS.map(([field, label]) => (
              <div key={field} className="space-y-2">
                <Label htmlFor={field}>{label}</Label>
                <select
                  id={field}
                  className="w-full rounded-xl border border-line bg-card px-3 py-2 text-sm"
                  value={mapping[field] ?? ""}
                  onChange={(event) => setMapping((current) => ({ ...current, [field]: event.target.value }))}
                >
                  <option value="">Skip</option>
                  {csvHeaders.map((header) => (
                    <option key={header} value={header}>{header}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          <Button type="submit" disabled={busy}>Validate roster</Button>
        </form>
      ) : null}

      <div className="flex flex-wrap gap-3">
        {canActivate && status === "READY" ? (
          <Button type="button" disabled={busy} onClick={() => void send(`/api/admin/campaigns/${campaignId}/activate`)}>Activate campaign</Button>
        ) : null}
        {canReveal && status === "ACTIVE" ? (
          <Button type="button" variant="brass" disabled={busy} onClick={() => void send(`/api/admin/campaigns/${campaignId}/url`, undefined, "GET").then((payload) => { if (payload.url) setSharedUrl(payload.url); })}>Show shared URL</Button>
        ) : null}
        {canReveal && status === "ACTIVE" ? (
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={() => {
              if (!window.confirm("Regenerating the URL makes the current shared link stop working.")) return;
              void send(`/api/admin/campaigns/${campaignId}/url`).then((payload) => { if (payload.url) setSharedUrl(payload.url); });
            }}
          >
            Regenerate shared URL
          </Button>
        ) : null}
        {canReveal && status === "ACTIVE" ? (
          <Button type="button" variant="danger" disabled={busy} onClick={() => void send(`/api/admin/campaigns/${campaignId}/revoke`)}>Revoke campaign</Button>
        ) : null}
      </div>

      {sharedUrl ? (
        <section className="lux-card rounded-3xl border border-line bg-card p-5">
          <h2 className="font-serif text-2xl">Shared campaign URL</h2>
          <p className="mt-2 text-sm text-ink-soft">Every customer in this campaign uses this same address. It is not shown in the campaign list.</p>
          <p className="mt-3 break-all font-medium">{sharedUrl}</p>
          <Button type="button" className="mt-3" variant="ghost" onClick={() => void navigator.clipboard.writeText(sharedUrl)}>Copy URL</Button>
        </section>
      ) : null}
      {error ? <p className="text-sm text-danger">{error}</p> : null}
    </div>
  );
}
