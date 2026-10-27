import { access, mkdtemp, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { acquirePdfSlot } from "@/lib/pdf/slots";
import {
  isAllowedWorkingDirectory,
  sweepStaleWorkingDirectories,
  trackWorkingDirectory,
  untrackWorkingDirectory,
} from "@/lib/pdf/temp-dirs";

describe("campaign temporary directories", () => {
  it("only allows Magnum working directories inside the system temp folder", () => {
    expect(isAllowedWorkingDirectory(path.join(tmpdir(), "magnum-campaign-test"))).toBe(true);
    expect(isAllowedWorkingDirectory(path.join(tmpdir(), "other-dir"))).toBe(false);
    expect(isAllowedWorkingDirectory(path.resolve("campaigns"))).toBe(false);
  });

  it("leaves an active directory in place and removes a stale one", async () => {
    const activeDir = await mkdtemp(path.join(tmpdir(), "magnum-campaign-"));
    const staleDir = await mkdtemp(path.join(tmpdir(), "magnum-campaign-"));
    const old = new Date(Date.now() - 120_000);
    await utimes(activeDir, old, old);
    await utimes(staleDir, old, old);
    trackWorkingDirectory(activeDir);
    await sweepStaleWorkingDirectories(60_000);
    await expect(access(activeDir)).resolves.toBeUndefined();
    await expect(access(staleDir)).rejects.toThrow();
    untrackWorkingDirectory(activeDir);
    await sweepStaleWorkingDirectories(60_000);
    await expect(access(activeDir)).rejects.toThrow();
  });

  it("limits concurrent PDF slots", async () => {
    const first = await acquirePdfSlot(1, 1000);
    try {
      await expect(acquirePdfSlot(1, 30)).rejects.toThrow(/busy/i);
    } finally {
      first();
    }
    const second = await acquirePdfSlot(1, 1000);
    second();
  });
});
