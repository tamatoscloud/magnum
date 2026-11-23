"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
      <h1 className="mt-2 font-serif text-3xl text-ink sm:text-4xl">Reset password</h1>
      <div className="gold-rule mt-4 max-w-[8rem]" />
      <form className="lux-card mt-6 space-y-4 rounded-2xl border border-line bg-card p-5 sm:p-6" onSubmit={form.handleSubmit(onSubmit)}>
        <div className="space-y-2">
          <Label htmlFor="email">Work email</Label>
          <Input id="email" type="email" {...form.register("email")} />
        </div>
        <Button type="submit">Send reset link</Button>
        {message ? <p className="text-sm text-ink-soft">{message}</p> : null}
      </form>
    </PublicFrame>
  );
}
