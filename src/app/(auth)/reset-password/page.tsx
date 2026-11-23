"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
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
    <form className="tm-box mt-8 space-y-5" onSubmit={form.handleSubmit(onSubmit)}>
      <div className="space-y-2">
        <label className="tm-label" htmlFor="password">New password</label>
        <input className="tm-input" id="password" type="password" autoComplete="new-password" {...form.register("password")} />
        <p className="text-sm text-tm-ink/70">At least 12 characters, with upper-case, lower-case, and a number.</p>
      </div>
      {error ? <p className="tm-error">{error}</p> : null}
      <button className="tm-button" type="submit">Update password</button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <PublicFrame eyebrow="Staff access">
      <h1 className="tm-heading mt-3">
        <span className="tm-accent">Choose</span> a new password
      </h1>
      <Suspense>
        <ResetForm />
      </Suspense>
    </PublicFrame>
  );
}
