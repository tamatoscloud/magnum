import { describe, expect, it } from "vitest";
import { campaignCanActivate, evaluateCampaignRoster } from "@/lib/campaigns/roster";
import { campaignUrl, generateToken, hashToken } from "@/lib/security/tokens";
import { can } from "@/lib/auth/permissions";

describe("campaign roster", () => {
  const mapping = {
    customer_name: "customer_name",
    folio_number: "folio_number",
    email: "email",
    phone_number: "phone_number",
  };

  it("keeps leading zeros and allows missing contact fields", () => {
    const result = evaluateCampaignRoster(
      [
        { customer_name: "Bilal Hussain", folio_number: "001245", email: "", phone_number: "" },
        { customer_name: "  Sara   Ali ", folio_number: "mag001246", email: "Sara.Ali@example.com", phone_number: "+923001112233" },
      ],
      mapping,
      "PK",
    );
    expect(result.rows[0]?.normalizedFolioNumber).toBe("001245");
    expect(result.rows[0]?.email).toBeNull();
    expect(result.rows[0]?.isValid).toBe(true);
    expect(result.rows[1]?.normalizedCustomerName).toBe("sara ali");
    expect(result.rows[1]?.normalizedFolioNumber).toBe("MAG001246");
    expect(result.rows[1]?.email).toBe("sara.ali@example.com");
    expect(result.issues.some((issue) => issue.severity === "ERROR")).toBe(false);
  });

  it("blocks duplicate folios inside one campaign", () => {
    const result = evaluateCampaignRoster(
      [
        { customer_name: "Ahmed Khan", folio_number: "MAG001245", email: "", phone_number: "" },
        { customer_name: "Ahmed Khan", folio_number: "mag001245", email: "", phone_number: "" },
      ],
      mapping,
      "PK",
    );
    expect(result.rows.every((row) => row.isValid)).toBe(false);
    expect(result.issues.some((issue) => issue.code === "DUPLICATE_FOLIO")).toBe(true);
  });

  it("activates only a ready campaign with a source PDF and no blocking errors", () => {
    expect(campaignCanActivate({ status: "READY", sourceSha256: "abc", validRecords: 2, blockingIssues: 0 })).toBe(true);
    expect(campaignCanActivate({ status: "DRAFT", sourceSha256: "abc", validRecords: 2, blockingIssues: 0 })).toBe(false);
    expect(campaignCanActivate({ status: "READY", sourceSha256: null, validRecords: 2, blockingIssues: 0 })).toBe(false);
    expect(campaignCanActivate({ status: "READY", sourceSha256: "abc", validRecords: 2, blockingIssues: 1 })).toBe(false);
  });

  it("builds a shared campaign URL from the configured base and stores only a hash", () => {
    const token = generateToken();
    expect(campaignUrl("http://localhost:3000/", token)).toBe(`http://localhost:3000/campaign/${token}`);
    expect(hashToken(token)).not.toContain(token);
    expect(can("OPERATOR", "campaigns:create")).toBe(true);
    expect(can("OPERATOR", "campaigns:activate")).toBe(false);
    expect(can("OPERATOR", "campaigns:reveal")).toBe(false);
    expect(can("ADMIN", "campaigns:revoke")).toBe(true);
  });
});
