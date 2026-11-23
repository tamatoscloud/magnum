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
      <h1 className="mt-2 font-serif text-3xl leading-tight text-ink sm:text-4xl">Access Your Annual Report</h1>
      <div className="gold-rule mt-4 max-w-[8rem]" />
      <div className="lux-card mt-6 rounded-2xl border border-line bg-card p-5 sm:p-6">
        {unavailable ? (
          <p className="text-sm text-ink-soft">This link is no longer available. Contact The Magnum Ice Cream Company shareholder services if you need a new one.</p>
        ) : verified ? (
          <div className="space-y-4">
            <p className="text-sm text-ink-soft">Identity verified. Download your encrypted annual report. It will ask for your folio number in uppercase, without spaces.</p>
            <a className={buttonVariants()} href="/api/public/campaign/download">
              Download annual report
            </a>
          </div>
        ) : (
          <VerifyForm token={token} endpoint="/api/public/campaign/verify" />
        )}
      </div>
      <p className="mt-5 text-xs leading-5 text-ink-soft">
        The Magnum Ice Cream Company uses your name and folio number to confirm this report belongs to you. This is not multi-factor authentication. Do not forward this link. The PDF password is your folio number.
      </p>
    </PublicFrame>
  );
}
