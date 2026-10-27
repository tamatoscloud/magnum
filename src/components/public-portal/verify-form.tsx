"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const schema = z.object({
  customerName: z.string().trim().min(2, "Enter your full name.").max(200),
  folioNumber: z.string().trim().min(1, "Enter your folio number.").max(64),
});

type Values = z.infer<typeof schema>;

export function VerifyForm({ token, endpoint = "/api/public/verify" }: { token: string; endpoint?: string }) {
  const [message, setMessage] = useState<string | null>(null);
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { customerName: "", folioNumber: "" } });

  async function onSubmit(values: Values) {
    setMessage(null);
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, ...values }),
    });
    const body = (await response.json()) as { error?: string };
    if (!response.ok) {
      setMessage(body.error ?? "We could not verify those details.");
      return;
    }
    window.location.reload();
  }

  return (
    <form className="mt-8 space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
      <div className="space-y-2">
        <Label htmlFor="customerName">Full name</Label>
        <Input id="customerName" autoComplete="name" {...form.register("customerName")} />
        {form.formState.errors.customerName ? <p className="text-sm text-danger">{form.formState.errors.customerName.message}</p> : null}
      </div>
      <div className="space-y-2">
        <Label htmlFor="folioNumber">Folio number</Label>
        <Input id="folioNumber" autoComplete="off" {...form.register("folioNumber")} />
        {form.formState.errors.folioNumber ? <p className="text-sm text-danger">{form.formState.errors.folioNumber.message}</p> : null}
      </div>
      {message ? <p className="text-sm text-danger">{message}</p> : null}
      <Button className="w-full" type="submit" disabled={form.formState.isSubmitting}>
        Verify
      </Button>
    </form>
  );
}
