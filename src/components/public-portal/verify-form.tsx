"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight } from "lucide-react";

const schema = z.object({
  customerName: z.string().trim().min(2, "Enter your full name.").max(200),
  folioNumber: z.string().trim().min(1, "Enter your folio number.").max(64),
});

type Values = z.infer<typeof schema>;

export function VerifyForm({ token, endpoint = "/api/public/verify" }: { token: string; endpoint?: string }) {
  const [message, setMessage] = useState<string | null>(null);
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { customerName: "", folioNumber: "" } });
  const errors = form.formState.errors;

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
    <form className="space-y-6" onSubmit={form.handleSubmit(onSubmit)} noValidate>
      <p className="tm-error">* Required fields are shown with an asterisk.</p>
      <div className="space-y-2">
        <label className="tm-label tm-required" htmlFor="customerName">
          Full name
        </label>
        <input
          id="customerName"
          className="tm-input"
          autoComplete="name"
          aria-invalid={errors.customerName ? true : undefined}
          {...form.register("customerName")}
        />
        {errors.customerName ? <p className="tm-error">{errors.customerName.message}</p> : null}
      </div>
      <div className="space-y-2">
        <label className="tm-label tm-required" htmlFor="folioNumber">
          Folio number
        </label>
        <input
          id="folioNumber"
          className="tm-input"
          autoComplete="off"
          aria-invalid={errors.folioNumber ? true : undefined}
          {...form.register("folioNumber")}
        />
        {errors.folioNumber ? <p className="tm-error">{errors.folioNumber.message}</p> : null}
      </div>
      {message ? (
        <p className="tm-error" role="alert">
          {message}
        </p>
      ) : null}
      <button className="tm-button" type="submit" disabled={form.formState.isSubmitting}>
        Verify
        <ArrowRight size={18} aria-hidden="true" />
      </button>
    </form>
  );
}
