import Link from "next/link";

export const dynamic = "force-dynamic";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/login-form";
import { PublicFrame } from "@/components/brand/public-frame";
import { getCurrentUser } from "@/lib/http";

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect("/admin");
  return (
    <PublicFrame eyebrow="Staff access">
      <h1 className="mt-2 font-serif text-3xl text-ink sm:text-4xl">Admin sign in</h1>
      <p className="mt-3 text-sm leading-6 text-ink-soft">
        Dividend statement distribution for authorised staff of The Magnum Ice Cream Company.
      </p>
      <div className="gold-rule mt-4 max-w-[8rem]" />
      <div className="lux-card mt-6 rounded-2xl border border-line bg-card p-5 sm:p-6">
        <Suspense>
          <LoginForm />
        </Suspense>
        <Link href="/forgot-password" className="mt-5 inline-block text-sm font-semibold text-brass underline-offset-4 hover:text-ink hover:underline">
          Forgot password
        </Link>
      </div>
    </PublicFrame>
  );
}
