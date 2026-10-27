"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const schema = z.object({
  defaultLinkExpiryDays: z.number().int().positive().max(3650),
  maxUploadSizeMb: z.number().positive().max(10240),
  originalRetentionDays: z.number().int().positive().max(3650),
  encryptedRetentionDays: z.number().int().positive().max(3650),
  exportRetentionHours: z.number().int().positive().max(168),
  notifyEmailDefault: z.boolean(),
  notifyWhatsappDefault: z.boolean(),
});

export type SettingsValues = z.infer<typeof schema>;

export function SettingsForm({ initial, canWrite }: { initial: SettingsValues; canWrite: boolean }) {
  const [message, setMessage] = useState<string | null>(null);
  const form = useForm<SettingsValues>({ resolver: zodResolver(schema), defaultValues: initial });

  async function onSubmit(values: SettingsValues) {
    setMessage(null);
    const response = await fetch("/api/admin/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    const body = (await response.json()) as { error?: string };
    setMessage(response.ok ? "Settings saved." : body.error ?? "Settings were not saved.");
  }

  return (
    <form className="grid gap-4 md:grid-cols-2" onSubmit={form.handleSubmit(onSubmit)}>
      <Field label="Default link expiry (days)" name="defaultLinkExpiryDays" form={form} disabled={!canWrite} />
      <Field label="Upload limit (MB)" name="maxUploadSizeMb" form={form} disabled={!canWrite} />
      <Field label="Original PDF retention (days)" name="originalRetentionDays" form={form} disabled={!canWrite} />
      <Field label="Encrypted PDF retention (days)" name="encryptedRetentionDays" form={form} disabled={!canWrite} />
      <Field label="Export retention (hours)" name="exportRetentionHours" form={form} disabled={!canWrite} />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" disabled={!canWrite} {...form.register("notifyEmailDefault")} /> Email by default
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" disabled={!canWrite} {...form.register("notifyWhatsappDefault")} /> WhatsApp by default
      </label>
      {canWrite ? <Button type="submit">Save settings</Button> : null}
      {message ? <p className="text-sm text-ink-soft">{message}</p> : null}
    </form>
  );
}

function Field({
  label,
  name,
  form,
  disabled,
}: {
  label: string;
  name: "defaultLinkExpiryDays" | "maxUploadSizeMb" | "originalRetentionDays" | "encryptedRetentionDays" | "exportRetentionHours";
  form: ReturnType<typeof useForm<SettingsValues>>;
  disabled: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} type="number" disabled={disabled} {...form.register(name, { valueAsNumber: true })} />
    </div>
  );
}
