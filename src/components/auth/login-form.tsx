"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

const schema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

type FormValues = z.infer<typeof schema>;

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { email: "", password: "" } });

  async function onSubmit(values: FormValues) {
    setError(null);
    const callback = safeCallback(params.get("callbackUrl"));
    const result = await signIn("credentials", { ...values, redirect: false, callbackUrl: callback });
    if (!result || result.error) {
      setError("Those credentials were not accepted.");
      return;
    }
    router.push(callback);
    router.refresh();
  }

  return (
    <form className="space-y-5" onSubmit={form.handleSubmit(onSubmit)}>
      <div className="space-y-2">
        <label className="tm-label" htmlFor="email">Email</label>
        <input className="tm-input" id="email" type="email" autoComplete="username" {...form.register("email")} />
      </div>
      <div className="space-y-2">
        <label className="tm-label" htmlFor="password">Password</label>
        <input className="tm-input" id="password" type="password" autoComplete="current-password" {...form.register("password")} />
      </div>
      {error ? <p className="tm-error">{error}</p> : null}
      <button className="tm-button w-full" type="submit" disabled={form.formState.isSubmitting}>
        {form.formState.isSubmitting ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}

function safeCallback(value: string | null): string {
  if (!value || !value.startsWith("/admin") || value.startsWith("//")) return "/admin";
  return value;
}
