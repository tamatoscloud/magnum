import { describe, expect, it } from "vitest";
import { PermanentDeliveryError, TransientDeliveryError, shouldRetryDelivery } from "@/lib/errors";

describe("delivery retries", () => {
  it("retries transient provider failures and stops on permanent rejection", () => {
    expect(shouldRetryDelivery(new TransientDeliveryError("rate limit", "http_429"))).toBe(true);
    expect(shouldRetryDelivery(new PermanentDeliveryError("bad template", "http_400"))).toBe(false);
    expect(shouldRetryDelivery(new Error("socket hang up"))).toBe(true);
  });
});
