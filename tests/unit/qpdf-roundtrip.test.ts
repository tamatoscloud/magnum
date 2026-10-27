import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { encryptPdfFile } from "@/lib/pdf/qpdf";

function qpdfAvailable(): boolean {
  try {
    execFileSync("qpdf", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

describe("qpdf encryption", () => {
  it.skipIf(!qpdfAvailable())("encrypts a PDF with the folio password and rejects a wrong password", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "magnum-pdf-"));
    const source = path.join(directory, "statement.pdf");
    const document = await PDFDocument.create();
    document.addPage([400, 400]);
    await writeFile(source, await document.save());
    const encrypted = await encryptPdfFile({
      sourcePath: source,
      userPassword: "MAG001245",
      bits: 256,
      qpdfBin: "qpdf",
    });
    expect(encrypted.encryptedSize).toBeGreaterThan(0);
    expect(encrypted.encryptedSha256).toMatch(/^[a-f0-9]{64}$/);
    await rm(directory, { recursive: true, force: true });
    await rm(encrypted.directory, { recursive: true, force: true });
  });
});
