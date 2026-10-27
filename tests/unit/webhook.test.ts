import { describe, expect, it } from "vitest";
import { signWebhook, verifyWebhookSignature } from "@/lib/security/webhook";

describe("webhook signatures", () => {
  it("accepts a matching signature and rejects tampering", () => {
    const body = JSON.stringify({ providerMessageId: "abc", status: "delivered" });
    const signature = signWebhook("top-secret", body);
    expect(verifyWebhookSignature("top-secret", body, signature)).toBe(true);
    expect(verifyWebhookSignature("top-secret", body, signWebhook("other", body))).toBe(false);
    expect(verifyWebhookSignature("top-secret", `${body} `, signature)).toBe(false);
  });
});
