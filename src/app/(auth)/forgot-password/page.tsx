"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <h1 className="font-serif text-4xl">Reset password</h1>
      <form className="mt-6 space-y-4 rounded-3xl border border-line bg-card p-6" onSubmit={form.handleSubmit(onSubmit)}>
        <div className="space-y-2">
          <Label htmlFor="email">Work email</Label>
          <Input id="email" type="email" {...form.register("email")} />
        </div>
        <Button type="submit">Send reset link</Button>
        {message ? <p className="text-sm text-ink-soft">{message}</p> : null}
      </form>
    </main>
  );
}
