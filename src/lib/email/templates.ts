/** Absolute URL of the logo on the same origin as the portal link, so email clients can load it. */
function brandLogoUrl(accessUrl: string): string | null {
  try {
    const { origin } = new URL(accessUrl);
    return `${origin}/images/brand/magnum-logo-ivory.png`;
  } catch {
    return null;
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function dividendMessage(input: {
  customerName: string;
  accessUrl: string;
  expiresAt: Date;
}): { subject: string; text: string; html: string } {
  const expiry = input.expiresAt.toUTCString();
  const subject = "Your Magnum dividend statement is ready";
  const text = [
    `Hello ${input.customerName},`,
    "",
    "Your dividend statement is ready. Open the secure link below and verify your full name and folio number to download it.",
    input.accessUrl,
    "",
    `This link expires on ${expiry}.`,
    "The PDF password is your folio number in uppercase, with spaces removed. Leading zeros are part of the password.",
    "",
    "The Magnum Ice Cream Company will not ask you to forward this link. If you were not expecting this message, contact shareholder services.",
  ].join("\n");

  const logoUrl = brandLogoUrl(input.accessUrl);
  const html = `<!doctype html>
<html>
  <body style="margin:0;background:#faf6f0;color:#2b1810;font-family:Georgia,'Times New Roman',serif;">
    <div style="max-width:560px;margin:0 auto;padding:32px 20px;">
      <div style="background:#2b1810;border-bottom:2px solid #d4af37;padding:22px 24px;text-align:left;">
        ${logoUrl ? `<img src="${escapeHtml(logoUrl)}" alt="The Magnum Ice Cream Company" width="160" style="display:block;width:160px;max-width:60%;height:auto;border:0;">` : `<p style="margin:0;letter-spacing:.18em;font-size:12px;color:#d4af37;">THE MAGNUM ICE CREAM COMPANY</p>`}
      </div>
      <div style="background:#ffffff;border:1px solid #eadfc9;border-top:0;padding:28px 24px;">
        <p style="margin:0 0 6px;letter-spacing:.24em;font-size:11px;text-transform:uppercase;color:#86652a;font-family:Arial,Helvetica,sans-serif;">Shareholder services</p>
        <h1 style="margin:0 0 18px;font-weight:500;font-size:28px;line-height:1.25;color:#2b1810;">Your dividend statement is ready</h1>
        <p>Hello ${escapeHtml(input.customerName)},</p>
        <p>Open your secure link and verify your full name and folio number to download the statement. The PDF is not attached to this email.</p>
        <p style="margin:26px 0;"><a href="${escapeHtml(input.accessUrl)}" style="display:inline-block;background:#2b1810;color:#faf6f0;border:1px solid #d4af37;border-radius:999px;padding:12px 22px;text-decoration:none;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;letter-spacing:.04em;">Access your statement</a></p>
        <p style="font-size:14px;color:#6b5246;">This link expires on ${escapeHtml(expiry)}.</p>
        <p style="font-size:14px;color:#6b5246;">The PDF password is your folio number in uppercase, with spaces removed. Leading zeros are part of the password.</p>
      </div>
      <p style="font-size:12px;color:#6b5246;padding:16px 4px;font-family:Arial,Helvetica,sans-serif;">The Magnum Ice Cream Company will not ask you to forward this link. If you were not expecting this message, contact shareholder services.</p>
    </div>
  </body>
</html>`;

  return { subject, text, html };
}
