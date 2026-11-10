"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function NewCampaignForm({ defaultExpiry }: { defaultExpiry: number }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="max-w-lg space-y-4 lux-card rounded-3xl border border-line bg-card p-6"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        setBusy(true);
        setError(null);
        void fetch("/api/admin/campaigns", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: String(data.get("name") ?? ""),
            linkExpiryDays: Number(data.get("linkExpiryDays") ?? defaultExpiry),
          }),
        })
          .then(async (response) => {
            const body = (await response.json()) as { id?: string; error?: string };
            if (!response.ok || !body.id) {
              setError(body.error ?? "The campaign could not be created.");
              return;
            }
            router.push(`/admin/campaigns/${body.id}`);
          })
          .catch(() => setError("The campaign could not be created."))
          .finally(() => setBusy(false));
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="name">Campaign name</Label>
        <Input id="name" name="name" required minLength={3} maxLength={120} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="linkExpiryDays">Link expiry days</Label>
        <Input id="linkExpiryDays" name="linkExpiryDays" type="number" min={1} max={3650} defaultValue={defaultExpiry} />
      </div>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <Button type="submit" disabled={busy}>Create campaign</Button>
    </form>
  );
}
