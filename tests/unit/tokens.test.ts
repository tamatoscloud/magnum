import { describe, expect, it } from "vitest";
import { addDays, customerUrl, decryptToken, encryptToken, generateToken, hashToken, isPast } from "@/lib/security/tokens";

const key = Buffer.from("dev-only-token-key-not-for-prod!");

describe("tokens and link expiry", () => {
  it("generates a token with at least 256 bits and stores only a hash", () => {
    const raw = generateToken();
    expect(Buffer.from(raw, "base64url").length).toBeGreaterThanOrEqual(32);
    expect(hashToken(raw)).not.toBe(raw);
    expect(hashToken(raw)).toHaveLength(64);
  });

  it("round-trips the recoverable ciphertext without putting the raw token in the hash", () => {
    const raw = generateToken();
    const cipher = encryptToken(raw, key);
    expect(cipher).not.toContain(raw);
    expect(decryptToken(cipher, key)).toBe(raw);
  });

  it("builds customer urls from the configured base url", () => {
    expect(customerUrl("https://portal.example", "abc")).toBe("https://portal.example/d/abc");
  });

  it("treats the expiry instant as expired", () => {
    const expiry = addDays(new Date("2026-01-01T00:00:00Z"), 30);
    expect(isPast(expiry, new Date("2026-01-31T00:00:00Z"))).toBe(true);
    expect(isPast(expiry, new Date("2026-01-30T00:00:00Z"))).toBe(false);
  });
});
