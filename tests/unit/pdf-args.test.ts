import { describe, expect, it } from "vitest";
import { buildEncryptArgs } from "@/lib/pdf/qpdf";

describe("pdf encryption arguments", () => {
  it("passes passwords as arguments without a shell and requests AES-256", () => {
    const args = buildEncryptArgs({
      bits: 256,
      inputPath: "in.pdf",
      outputPath: "out.pdf",
      userPassword: "MAG001245",
      ownerPassword: "owner-secret",
    });
    expect(args).toEqual(["--encrypt", "MAG001245", "owner-secret", "256", "--", "in.pdf", "out.pdf"]);
    expect(args.join(" ").includes("&&")).toBe(false);
  });

  it("requests AES for 128-bit compatibility mode", () => {
    const args = buildEncryptArgs({
      bits: 128,
      inputPath: "in.pdf",
      outputPath: "out.pdf",
      userPassword: "MAG001245",
      ownerPassword: "owner-secret",
    });
    expect(args).toContain("--use-aes=y");
  });
});
