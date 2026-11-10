import { cookies } from "next/headers";
import { VerifyForm } from "@/components/public-portal/verify-form";
import { PublicFrame } from "@/components/brand/public-frame";
import { buttonVariants } from "@/components/ui/button";
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
  if (!unavailable && campaign && sessionToken) {
    const session = await prisma.campaignVerificationSession.findUnique({ where: { sessionTokenHash: hashToken(sessionToken) } });
    verified = Boolean(session && session.campaignId === campaign.id && !isPast(session.expiresAt));
  }

  return (
    <PublicFrame eyebrow="Shareholder services">
      <h1 className="mt-3 font-serif text-4xl leading-tight text-ink sm:text-5xl">Access Your Annual Report</h1>
      <div className="gold-rule mt-6 max-w-[8rem]" />
      <div className="lux-card mt-8 rounded-3xl border border-line bg-card p-6 sm:p-8">
        {unavailable ? (
          <p className="text-sm text-ink-soft">This link is no longer available. Contact The Magnum Ice Cream Company shareholder services if you need a new one.</p>
        ) : verified ? (
          <div className="space-y-4">
            <p className="text-sm text-ink-soft">Identity verified. Download your encrypted annual report. It will ask for your folio number in uppercase, without spaces. Leading zeros are part of the password.</p>
            <a className={buttonVariants()} href="/api/public/campaign/download">
              Download annual report
            </a>
          </div>
        ) : (
          <VerifyForm token={token} endpoint="/api/public/campaign/verify" />
        )}
      </div>
      <p className="mt-6 text-xs leading-5 text-ink-soft">
        The Magnum Ice Cream Company uses your name and folio number to confirm this report belongs to you. This is not multi-factor authentication. Do not forward this link. The PDF password is your folio number and can be guessed if the folio is short.
      </p>
    </PublicFrame>
  );
}
