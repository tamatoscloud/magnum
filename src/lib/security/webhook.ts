import { createHmac, timingSafeEqual } from "node:crypto";

export function signWebhook(secret: string, rawBody: string): string {
  return `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;
}

export function verifyWebhookSignature(secret: string, rawBody: string, header: string | null): boolean {
  if (!header || !secret) return false;
  const expected = signWebhook(secret, rawBody);
  const actual = Buffer.from(header);
  const wanted = Buffer.from(expected);
  if (actual.length !== wanted.length) return false;
  return timingSafeEqual(actual, wanted);
}
