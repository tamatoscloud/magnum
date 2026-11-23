import { cookies } from "next/headers";
import { prisma } from "@/lib/db/prisma";
import { hashToken, isPast } from "@/lib/security/tokens";
import { PORTAL_COOKIE } from "@/server/services/verification-service";
import { VerifyForm } from "@/components/public-portal/verify-form";
import { SessionCountdown } from "@/components/public-portal/session-countdown";
import { PublicFrame } from "@/components/brand/public-frame";
import { ArrowRight } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function DividendLinkPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const link = await prisma.accessLink.findUnique({ where: { tokenHash: hashToken(token) } });
  const unavailable = !link || link.status !== "ACTIVE" || isPast(link.expiresAt);
  const jar = await cookies();
  const sessionToken = jar.get(PORTAL_COOKIE)?.value;
  let verified = false;
  let sessionExpiresAt: Date | null = null;
  if (!unavailable && link && sessionToken) {
    const session = await prisma.verificationSession.findUnique({ where: { sessionTokenHash: hashToken(sessionToken) } });
    verified = Boolean(session && session.accessLinkId === link.id && !isPast(session.expiresAt));
    if (verified && session) sessionExpiresAt = session.expiresAt;
  }

  return (
    <PublicFrame eyebrow="Shareholder services">
      <h1 className="tm-heading mt-3">
        <span className="tm-accent">Access</span> your dividend statement
      </h1>
      {!unavailable && !verified ? (
        <p className="tm-lead mt-4">Please enter your full name and folio number below to open your dividend statement securely.</p>
      ) : null}
      <div className="tm-box mt-8">
        {unavailable ? (
          <p className="tm-small">This link is no longer available. Contact The Magnum Ice Cream Company shareholder services if you need a new one.</p>
        ) : verified ? (
          <div className="space-y-5">
            <p className="tm-small">Identity verified. Download your encrypted statement. It will ask for your folio number in uppercase, without spaces. Leading zeros are part of the password.</p>
            <a className="tm-button" href="/api/public/download">
              Download statement
              <ArrowRight size={18} aria-hidden="true" />
            </a>
            {sessionExpiresAt ? <SessionCountdown expiresAt={sessionExpiresAt.toISOString()} /> : null}
          </div>
        ) : (
          <VerifyForm token={token} />
        )}
      </div>
      <div className="tm-box-blue mt-6">
        <p className="text-[0.95rem] leading-6 text-tm-ink">
          The Magnum Ice Cream Company uses your name and folio number to confirm this statement belongs to you. This is not multi-factor authentication. Do not forward this link. The PDF password is your folio number and can be guessed if the folio is short.
        </p>
      </div>
    </PublicFrame>
  );
}
