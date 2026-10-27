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
    "Magnum will not ask you to forward this link. If you were not expecting this message, contact Magnum.",
  ].join("\n");

  const html = `<!doctype html>
<html>
  <body style="margin:0;background:#f3efe6;color:#142033;font-family:Georgia,serif;">
    <div style="max-width:560px;margin:0 auto;padding:32px 20px;">
      <p style="letter-spacing:.18em;font-size:12px;">MAGNUM</p>
      <h1 style="font-weight:500;font-size:28px;">Your dividend statement is ready</h1>
      <p>Hello ${escapeHtml(input.customerName)},</p>
      <p>Open your secure link and verify your full name and folio number to download the statement. The PDF is not attached to this email.</p>
      <p><a href="${escapeHtml(input.accessUrl)}" style="display:inline-block;background:#142033;color:#f3efe6;padding:12px 18px;text-decoration:none;">Access your statement</a></p>
      <p style="font-size:14px;">This link expires on ${escapeHtml(expiry)}.</p>
      <p style="font-size:14px;">The PDF password is your folio number in uppercase, with spaces removed. Leading zeros are part of the password.</p>
    </div>
  </body>
</html>`;

  return { subject, text, html };
}
