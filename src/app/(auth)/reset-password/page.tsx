"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PublicFrame } from "@/components/brand/public-frame";

const schema = z.object({
  password: z.string().min(12).regex(/[a-z]/).regex(/[A-Z]/).regex(/[0-9]/),
});

function ResetForm() {
  const params = useSearchParams();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<{ password: string }>({ resolver: zodResolver(schema) });

  async function onSubmit(values: { password: string }) {
    setError(null);
    const response = await fetch("/api/auth/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: params.get("token") ?? "", password: values.password }),
    });
    const body = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(body.error ?? "This reset link is invalid or has expired.");
      return;
    }
    router.push("/login");
  }

  return (
    <form className="lux-card mt-8 space-y-4 rounded-3xl border border-line bg-card p-6 sm:p-8" onSubmit={form.handleSubmit(onSubmit)}>
      <div className="space-y-2">
        <Label htmlFor="password">New password</Label>
        <Input id="password" type="password" autoComplete="new-password" {...form.register("password")} />
        <p className="text-xs text-ink-soft">At least 12 characters, with upper-case, lower-case, and a number.</p>
      </div>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <Button type="submit">Update password</Button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <PublicFrame eyebrow="Staff access">
      <h1 className="mt-3 font-serif text-4xl text-ink sm:text-5xl">Choose a new password</h1>
      <div className="gold-rule mt-6 max-w-[8rem]" />
      <Suspense>
        <ResetForm />
      </Suspense>
    </PublicFrame>
  );
}
