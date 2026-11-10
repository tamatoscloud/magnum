"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const FIELDS = [
  ["customer_name", "Customer name"],
  ["folio_number", "Folio number"],
  ["email", "Email"],
  ["phone_number", "Phone"],
  ["pdf_filename", "PDF filename"],
] as const;

export function UploadWizard({
  defaultExpiry,
  notifyEmail,
  notifyWhatsapp,
}: {
  defaultExpiry: number;
  notifyEmail: boolean;
  notifyWhatsapp: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});

  async function upload(formData: FormData) {
    setError(null);
    setProgress(0);
    const body = await new Promise<{ id?: string; headers?: string[]; suggestedMapping?: Record<string, string>; error?: string }>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/admin/batches");
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) setProgress(Math.round((event.loaded / event.total) * 100));
      };
      xhr.onload = () => {
        try {
          resolve(JSON.parse(xhr.responseText) as { id?: string; headers?: string[]; suggestedMapping?: Record<string, string>; error?: string });
        } catch {
          reject(new Error("Upload failed."));
        }
      };
      xhr.onerror = () => reject(new Error("Upload failed."));
      xhr.send(formData);
    });
    if (!body.id || !body.headers) {
      setError(body.error ?? "Upload failed.");
      setProgress(null);
      return;
    }
    setBatchId(body.id);
    setHeaders(body.headers);
    setMapping(body.suggestedMapping ?? {});
    setProgress(null);
  }

  async function confirmMapping() {
    if (!batchId) return;
    setError(null);
    const response = await fetch(`/api/admin/batches/${batchId}/mapping`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mapping }),
    });
    const body = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(body.error ?? "Mapping could not be saved.");
      return;
    }
    router.push(`/admin/batches/${batchId}`);
  }

  return (
    <div className="lux-card rounded-3xl border border-line bg-card p-6">
      {!batchId ? (
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            void upload(form);
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="batchName">Batch name</Label>
            <Input id="batchName" name="batchName" required minLength={3} placeholder="March 2026 final dividend" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="linkExpiryDays">Link expiry (days)</Label>
            <Input id="linkExpiryDays" name="linkExpiryDays" type="number" min={1} defaultValue={defaultExpiry} />
          </div>
          <label className="flex items-center gap-2 text-sm"><input name="notifyEmail" value="true" type="checkbox" defaultChecked={notifyEmail} /> Send email</label>
          <label className="flex items-center gap-2 text-sm"><input name="notifyWhatsapp" value="true" type="checkbox" defaultChecked={notifyWhatsapp} /> Send WhatsApp</label>
          <div className="space-y-2">
            <Label htmlFor="csv">Customer CSV</Label>
            <Input id="csv" name="csv" type="file" accept=".csv,text/csv" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="zip">PDF ZIP archive</Label>
            <Input id="zip" name="zip" type="file" accept=".zip,application/zip" required />
          </div>
          <Button type="submit">Upload</Button>
          {progress !== null ? <p className="text-sm text-ink-soft">Uploading {progress}%</p> : null}
        </form>
      ) : (
        <div className="space-y-4">
          <h2 className="font-serif text-2xl">Match the CSV columns</h2>
          {FIELDS.map(([field, label]) => (
            <div key={field} className="space-y-2">
              <Label htmlFor={field}>{label}</Label>
              <select
                id={field}
                className="w-full rounded-xl border border-line bg-card px-3 py-2.5 text-sm"
                value={mapping[field] ?? ""}
                onChange={(event) => setMapping((current) => ({ ...current, [field]: event.target.value }))}
              >
                <option value="">Select a column</option>
                {headers.map((header) => (
                  <option key={header} value={header}>{header}</option>
                ))}
              </select>
            </div>
          ))}
          <Button type="button" onClick={() => void confirmMapping()}>Validate batch</Button>
        </div>
      )}
      {error ? <p className="mt-4 text-sm text-danger">{error}</p> : null}
    </div>
  );
}
