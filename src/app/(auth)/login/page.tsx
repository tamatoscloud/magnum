import Link from "next/link";

export const dynamic = "force-dynamic";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/login-form";
import { getCurrentUser } from "@/lib/http";

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect("/admin");
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-16">
      <p className="font-serif text-sm tracking-[0.22em] text-brass">MAGNUM</p>
      <h1 className="mt-3 font-serif text-4xl text-ink">Admin sign in</h1>
      <p className="mt-2 text-sm text-ink-soft">Dividend statement distribution for authorized Magnum staff.</p>
      <div className="mt-8 rounded-3xl border border-line bg-card p-6 shadow-sm">
        <Suspense>
          <LoginForm />
        </Suspense>
        <Link href="/forgot-password" className="mt-4 block text-sm text-brass">
          Forgot password
        </Link>
      </div>
    </main>
  );
}
