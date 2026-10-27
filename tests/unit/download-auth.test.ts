import { describe, expect, it } from "vitest";
import { AppError } from "@/lib/errors";
import { authorizeDownload } from "@/server/services/verification-service";

describe("download authorization", () => {
  it("rejects a request that has no verification session", async () => {
    await expect(authorizeDownload(undefined, "127.0.0.1")).rejects.toBeInstanceOf(AppError);
  });
});
