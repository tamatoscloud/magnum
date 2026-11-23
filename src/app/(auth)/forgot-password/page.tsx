"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { PublicFrame } from "@/components/brand/public-frame";

const schema = z.object({ email: z.string().trim().email() });

export default function ForgotPasswordPage() {
  const [message, setMessage] = useState<string | null>(null);
  const form = useForm<{ email: string }>({ resolver: zodResolver(schema) });

  async function onSubmit(values: { email: string }) {
    const response = await fetch("/api/auth/forgot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    const body = (await response.json()) as { message?: string };
    setMessage(body.message ?? "If the account exists, a reset link has been sent.");
  }

  return (
    <PublicFrame eyebrow="Staff access">
      <h1 className="tm-heading mt-3">
        <span className="tm-accent">Reset</span> password
      </h1>
      <form className="tm-box mt-8 space-y-5" onSubmit={form.handleSubmit(onSubmit)}>
        <div className="space-y-2">
          <label className="tm-label" htmlFor="email">Work email</label>
          <input className="tm-input" id="email" type="email" {...form.register("email")} />
        </div>
        <button className="tm-button" type="submit">Send reset link</button>
        {message ? <p className="tm-small">{message}</p> : null}
      </form>
    </PublicFrame>
  );
}
