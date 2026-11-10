"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function UserManager() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="grid gap-3 lux-card rounded-3xl border border-line bg-card p-5 md:grid-cols-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const response = await fetch("/api/admin/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: form.get("name"),
            email: form.get("email"),
            role: form.get("role"),
          }),
        });
        const body = (await response.json()) as { error?: string };
        if (!response.ok) {
          setError(body.error ?? "User was not created.");
          return;
        }
        setError("Account created. A password reset link was sent.");
        router.refresh();
      }}
    >
      <Input name="name" placeholder="Name" required />
      <Input name="email" type="email" placeholder="Email" required />
      <select name="role" className="rounded-xl border border-line px-3 py-2 text-sm">
        <option value="OPERATOR">Operator</option>
        <option value="ADMIN">Admin</option>
        <option value="SUPER_ADMIN">Super admin</option>
      </select>
      <Button type="submit">Create user</Button>
      {error ? <p className="text-sm text-ink-soft md:col-span-4">{error}</p> : null}
    </form>
  );
}

export function UserActiveToggle({ id, isActive }: { id: string; isActive: boolean }) {
  const router = useRouter();
  return (
    <Button
      type="button"
      variant="ghost"
      onClick={async () => {
        await fetch(`/api/admin/users/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isActive: !isActive }),
        });
        router.refresh();
      }}
    >
      {isActive ? "Deactivate" : "Activate"}
    </Button>
  );
}
