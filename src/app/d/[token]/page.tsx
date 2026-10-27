import { cookies } from "next/headers";
import { prisma } from "@/lib/db/prisma";
import { hashToken, isPast } from "@/lib/security/tokens";
import { PORTAL_COOKIE } from "@/server/services/verification-service";
import { VerifyForm } from "@/components/public-portal/verify-form";

export const dynamic = "force-dynamic";

export default async function DividendLinkPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const link = await prisma.accessLink.findUnique({ where: { tokenHash: hashToken(token) } });
  const unavailable = !link || link.status !== "ACTIVE" || isPast(link.expiresAt);
  const jar = await cookies();
  const sessionToken = jar.get(PORTAL_COOKIE)?.value;
  let verified = false;
  if (!unavailable && link && sessionToken) {
    const session = await prisma.verificationSession.findUnique({ where: { sessionTokenHash: hashToken(sessionToken) } });
    verified = Boolean(session && session.accessLinkId === link.id && !isPast(session.expiresAt));
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6 py-16">
      <p className="font-serif text-sm tracking-[0.22em] text-brass">MAGNUM</p>
      <h1 className="mt-3 font-serif text-4xl leading-tight">Access Your Dividend Statement</h1>
      <div className="mt-8 rounded-3xl border border-line bg-card p-6 shadow-sm">
        {unavailable ? (
          <p className="text-sm text-ink-soft">This link is no longer available. Contact Magnum if you need a new one.</p>
        ) : verified ? (
          <div className="space-y-4">
            <p className="text-sm text-ink-soft">Identity verified. Download your encrypted statement. It will ask for your folio number in uppercase, without spaces. Leading zeros are part of the password.</p>
            <a className="inline-flex rounded-full bg-ink px-4 py-2 text-sm text-paper" href="/api/public/download">
              Download statement
            </a>
          </div>
        ) : (
          <VerifyForm token={token} />
        )}
      </div>
      <p className="mt-6 text-xs leading-5 text-ink-soft">
        Magnum uses your name and folio number to confirm this statement belongs to you. This is not multi-factor authentication. Do not forward this link. The PDF password is your folio number and can be guessed if the folio is short.
      </p>
    </main>
  );
}
