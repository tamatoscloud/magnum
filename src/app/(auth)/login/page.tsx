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
      <h1 className="tm-heading mt-2">
        <span className="tm-accent">Admin</span> sign in
      </h1>
      <p className="tm-lead mt-3">
        Dividend statement distribution for authorised staff of The Magnum Ice Cream Company.
      </p>
      <div className="tm-box mt-5">
        <Suspense>
          <LoginForm />
        </Suspense>
        <Link href="/forgot-password" className="mt-5 inline-block font-medium text-tm-brown underline-offset-4 hover:underline">
          Forgot password
        </Link>
      </div>
    </PublicFrame>
  );
}
