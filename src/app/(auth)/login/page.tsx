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
      <h1 className="mt-3 font-serif text-4xl text-ink sm:text-5xl">Admin sign in</h1>
      <p className="mt-3 text-sm leading-6 text-ink-soft">
        Dividend statement distribution for authorised staff of The Magnum Ice Cream Company.
      </p>
      <div className="gold-rule mt-6 max-w-[8rem]" />
      <div className="lux-card mt-8 rounded-3xl border border-line bg-card p-6 sm:p-8">
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
