"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function BatchActions({
  batchId,
  canProcess,
  canCancel,
  canRetry,
  canExport,
}: {
  batchId: string;
  canProcess: boolean;
  canCancel: boolean;
  canRetry: boolean;
  canExport: boolean;
}) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function post(url: string) {
    setBusy(true);
    setMessage(null);
    const response = await fetch(url, { method: "POST" });
    const body = (await response.json()) as { error?: string };
    setBusy(false);
    if (!response.ok) {
      setMessage(body.error ?? "The action failed.");
      return;
    }
    router.refresh();
  }

  async function downloadReport() {
    setBusy(true);
    setMessage(null);
    const created = await fetch(`/api/admin/batches/${batchId}/reports`, { method: "POST" });
    const payload = (await created.json()) as { reportId?: string; error?: string };
    if (!created.ok || !payload.reportId) {
      setBusy(false);
      setMessage(payload.error ?? "Report could not be queued.");
      return;
    }
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const response = await fetch(`/api/admin/reports/${payload.reportId}`);
      const type = response.headers.get("content-type") ?? "";
      if (response.ok && type.includes("text/csv")) {
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = "batch-links.csv";
        anchor.click();
        URL.revokeObjectURL(url);
        setBusy(false);
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    setBusy(false);
    setMessage("The report is still generating. Try again in a moment.");
  }

  return (
    <div className="flex flex-wrap gap-2">
      {canProcess ? <Button type="button" disabled={busy} onClick={() => void post(`/api/admin/batches/${batchId}/process`)}>Process valid records</Button> : null}
      {canRetry ? <Button type="button" variant="ghost" disabled={busy} onClick={() => void post(`/api/admin/batches/${batchId}/retry`)}>Retry failed</Button> : null}
      {canCancel ? <Button type="button" variant="danger" disabled={busy} onClick={() => void post(`/api/admin/batches/${batchId}/cancel`)}>Cancel batch</Button> : null}
      {canExport ? <Button type="button" variant="brass" disabled={busy} onClick={() => void downloadReport()}>Download output CSV</Button> : null}
      <a className="inline-flex items-center rounded-full border border-line px-4 py-2 text-sm" href={`/api/admin/batches/${batchId}/errors`}>
        Error report
      </a>
      {message ? <p className="w-full text-sm text-danger">{message}</p> : null}
    </div>
  );
}
