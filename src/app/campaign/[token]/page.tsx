import { cookies } from "next/headers";
import { VerifyForm } from "@/components/public-portal/verify-form";
import { SessionCountdown } from "@/components/public-portal/session-countdown";
import { PublicFrame } from "@/components/brand/public-frame";
import { ArrowRight } from "lucide-react";
import { prisma } from "@/lib/db/prisma";
import { hashToken, isPast } from "@/lib/security/tokens";
import { CAMPAIGN_COOKIE } from "@/server/services/campaign-portal";

export const dynamic = "force-dynamic";

export default async function CampaignPortalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const campaign = await prisma.reportCampaign.findUnique({ where: { tokenHash: hashToken(token) } });
  const unavailable = !campaign || campaign.status !== "ACTIVE" || (campaign.expiresAt ? isPast(campaign.expiresAt) : false);
  const jar = await cookies();
  const sessionToken = jar.get(CAMPAIGN_COOKIE)?.value;
  let verified = false;
  let sessionExpiresAt: Date | null = null;
  if (!unavailable && campaign && sessionToken) {
    const session = await prisma.campaignVerificationSession.findUnique({ where: { sessionTokenHash: hashToken(sessionToken) } });
    verified = Boolean(session && session.campaignId === campaign.id && !isPast(session.expiresAt));
    if (verified && session) sessionExpiresAt = session.expiresAt;
  }

  return (
    <PublicFrame eyebrow="Shareholder services">
      <h1 className="tm-heading mt-2">
        <span className="tm-accent">Access</span> your annual report
      </h1>
      {!unavailable && !verified ? (
        <p className="tm-lead mt-3">Please enter your full name and folio number below to open your annual report securely.</p>
      ) : null}
      <div className="tm-box mt-5">
        {unavailable ? (
          <p className="tm-small">This link is no longer available. Contact The Magnum Ice Cream Company shareholder services if you need a new one.</p>
        ) : verified ? (
          <div className="space-y-5">
            <p className="tm-small">Identity verified. Download your encrypted annual report. It will ask for your folio number in uppercase, without spaces.</p>
            <a className="tm-button" href="/api/public/campaign/download">
              Download annual report
              <ArrowRight size={18} aria-hidden="true" />
            </a>
            {sessionExpiresAt ? <SessionCountdown expiresAt={sessionExpiresAt.toISOString()} /> : null}
          </div>
        ) : (
          <VerifyForm token={token} endpoint="/api/public/campaign/verify" />
        )}
      </div>
      <div className="tm-box-blue mt-4">
        <p className="text-sm leading-6 text-tm-ink">
          The Magnum Ice Cream Company uses your name and folio number to confirm this report belongs to you. This is not multi-factor authentication. Do not forward this link. The PDF password is your folio number.
        </p>
      </div>
    </PublicFrame>
  );
}
