import { describe, expect, it } from "vitest";
import { can } from "@/lib/auth/permissions";

describe("authorization", () => {
  it("lets operators upload but not export bearer links or change settings", () => {
    expect(can("OPERATOR", "batches:create")).toBe(true);
    expect(can("OPERATOR", "reports:export")).toBe(false);
    expect(can("OPERATOR", "settings:write")).toBe(false);
    expect(can("OPERATOR", "links:manage")).toBe(false);
  });

  it("lets admins manage links and exports but not other administrators", () => {
    expect(can("ADMIN", "links:manage")).toBe(true);
    expect(can("ADMIN", "reports:export")).toBe(true);
    expect(can("ADMIN", "users:manage")).toBe(false);
    expect(can("ADMIN", "audit:read")).toBe(true);
  });

  it("reserves user administration for super admins", () => {
    expect(can("SUPER_ADMIN", "users:manage")).toBe(true);
    expect(can("SUPER_ADMIN", "settings:write")).toBe(true);
  });
});
