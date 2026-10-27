import { describe, expect, it } from "vitest";
import { foliosMatch, namesMatch, normalizeFolio, normalizeName, pdfMatchKey, isSafeRelativePath } from "@/lib/security/normalize";

describe("normalization", () => {
  it("trims, casefolds, and collapses a customer name", () => {
    expect(normalizeName("  Ahmed   Khan ")).toBe("ahmed khan");
    expect(namesMatch("AHMED khan", normalizeName("Ahmed Khan"))).toBe(true);
  });

  it("preserves leading zeros and does not treat the folio as a number", () => {
    expect(normalizeFolio("  001245 ")).toBe("001245");
    expect(normalizeFolio("mag 001245")).toBe("MAG001245");
    expect(foliosMatch("mag001245", "MAG001245")).toBe(true);
    expect(normalizeFolio("001245")).not.toBe(String(1245));
  });

  it("matches pdf filenames by basename", () => {
    expect(pdfMatchKey("statements/MAG001245.PDF")).toBe("mag001245.pdf");
  });

  it("rejects path traversal and absolute archive names", () => {
    expect(isSafeRelativePath("../evil.pdf")).toBe(false);
    expect(isSafeRelativePath("/etc/passwd")).toBe(false);
    expect(isSafeRelativePath("C:/secret.pdf")).toBe(false);
    expect(isSafeRelativePath("statements/MAG001245.pdf")).toBe(true);
  });
});
