import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { inspectZip } from "@/lib/zip/inspect";

const limits = {
  maxEntries: 20,
  maxUncompressedBytes: 5_000_000,
  maxCompressionRatio: 100,
  maxEntryBytes: 1_000_000,
};

describe("zip safety", () => {
  it("rejects path traversal entries", async () => {
    const zip = new JSZip();
    zip.file("../evil.pdf", Buffer.from("%PDF-1.4\n"));
    zip.file("ok.pdf", Buffer.from("%PDF-1.4\n"));
    const directory = await mkdtemp(path.join(tmpdir(), "magnum-zip-"));
    const file = path.join(directory, "batch.zip");
    await writeFile(file, await zip.generateAsync({ type: "nodebuffer" }));
    await expect(inspectZip(file, limits)).rejects.toThrow(/unsafe path/i);
    await rm(directory, { recursive: true, force: true });
  });

  it("lists a normal pdf entry", async () => {
    const zip = new JSZip();
    zip.file("MAG001245.pdf", Buffer.from("%PDF-1.4\n"));
    const directory = await mkdtemp(path.join(tmpdir(), "magnum-zip-"));
    const file = path.join(directory, "batch.zip");
    await writeFile(file, await zip.generateAsync({ type: "nodebuffer" }));
    const inspection = await inspectZip(file, limits);
    expect(inspection.entries.map((entry) => entry.fileName)).toContain("MAG001245.pdf");
    expect(inspection.entries[0]?.safe).toBe(true);
    await rm(directory, { recursive: true, force: true });
  });

  it("rejects a malformed archive", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "magnum-zip-"));
    const file = path.join(directory, "bad.zip");
    await writeFile(file, Buffer.from("this is not a zip"));
    await expect(inspectZip(file, limits)).rejects.toThrow(/malformed/i);
    await rm(directory, { recursive: true, force: true });
  });
});
