"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function CustomerActions({
  customerId,
  linkId,
  canManage,
  canResend,
}: {
  customerId: string;
  linkId: string | null;
  canManage: boolean;
  canResend: boolean;
}) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);

  async function call(path: string, method = "POST", body?: unknown) {
    setMessage(null);
    const response = await fetch(path, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const payload = (await response.json()) as { error?: string; url?: string };
    if (!response.ok) {
      setMessage(payload.error ?? "The action failed.");
      return;
    }
    if (payload.url) setUrl(payload.url);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {canResend ? <Button type="button" onClick={() => void call(`/api/admin/customers/${customerId}/resend`, "POST", { channel: "BOTH" })}>Resend notifications</Button> : null}
        {canManage && linkId ? <Button type="button" variant="danger" onClick={() => void call(`/api/admin/links/${linkId}/revoke`)}>Revoke link</Button> : null}
        {canManage && linkId ? <Button type="button" variant="ghost" onClick={() => void call(`/api/admin/links/${linkId}/regenerate`)}>Regenerate link</Button> : null}
      </div>
      {url ? (
        <p className="rounded-2xl bg-paper px-3 py-2 text-sm">
          New customer URL, shown once: <span className="break-all font-medium">{url}</span>
        </p>
      ) : null}
      {message ? <p className="text-sm text-danger">{message}</p> : null}
    </div>
  );
}
