import { cookies } from "next/headers";
import { prisma } from "@/lib/db/prisma";
import { hashToken, isPast } from "@/lib/security/tokens";
import { PORTAL_COOKIE } from "@/server/services/verification-service";
import { VerifyForm } from "@/components/public-portal/verify-form";
import { PublicFrame } from "@/components/brand/public-frame";
import { buttonVariants } from "@/components/ui/button";

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
    <PublicFrame eyebrow="Shareholder services">
      <h1 className="mt-3 font-serif text-4xl leading-tight text-ink sm:text-5xl">Access Your Dividend Statement</h1>
      <div className="gold-rule mt-6 max-w-[8rem]" />
      <div className="lux-card mt-8 rounded-3xl border border-line bg-card p-6 sm:p-8">
        {unavailable ? (
          <p className="text-sm text-ink-soft">This link is no longer available. Contact The Magnum Ice Cream Company shareholder services if you need a new one.</p>
        ) : verified ? (
          <div className="space-y-4">
            <p className="text-sm text-ink-soft">Identity verified. Download your encrypted statement. It will ask for your folio number in uppercase, without spaces. Leading zeros are part of the password.</p>
            <a className={buttonVariants()} href="/api/public/download">
              Download statement
            </a>
          </div>
        ) : (
          <VerifyForm token={token} />
        )}
      </div>
      <p className="mt-6 text-xs leading-5 text-ink-soft">
        The Magnum Ice Cream Company uses your name and folio number to confirm this statement belongs to you. This is not multi-factor authentication. Do not forward this link. The PDF password is your folio number and can be guessed if the folio is short.
      </p>
    </PublicFrame>
  );
}
