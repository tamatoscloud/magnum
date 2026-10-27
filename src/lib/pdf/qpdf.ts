import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdtemp, open, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { randomBytes } from "node:crypto";
import { sanitizeErrorMessage } from "@/lib/security/sanitize";
import { discardWorkingDirectory, trackWorkingDirectory } from "@/lib/pdf/temp-dirs";

export type QpdfResult = {
  code: number;
  stderr: string;
  stdout: string;
};

export function buildEncryptArgs(input: {
  bits: 128 | 256;
  inputPath: string;
  outputPath: string;
  userPassword: string;
  ownerPassword: string;
}): string[] {
  assertPasswordMaterial(input.userPassword);
  assertPasswordMaterial(input.ownerPassword);
  const args = ["--encrypt", input.userPassword, input.ownerPassword, String(input.bits)];
  if (input.bits === 128) args.push("--use-aes=y");
  args.push("--", input.inputPath, input.outputPath);
  return args;
}

export function assertPasswordMaterial(password: string): void {
  if (!password || password.length > 128) throw new Error("PDF password is empty or too long.");
  if (/[\0\r\n]/.test(password)) throw new Error("PDF password contains unsupported characters.");
}

export async function runQpdf(bin: string, args: string[], secrets: string[], timeoutMs = 120_000): Promise<QpdfResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { shell: false, windowsHide: true });
    let stderr = "";
    let stdout = "";
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback();
    };
    const timer = setTimeout(() => {
      child.kill();
      finish(() => reject(new Error("PDF processing timed out.")));
    }, timeoutMs);
    child.stderr.setEncoding("utf8");
    child.stdout.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr = (stderr + chunk).slice(0, 4000);
    });
    child.stdout.on("data", (chunk: string) => {
      stdout = (stdout + chunk).slice(0, 4000);
    });
    child.on("error", (error) => {
      finish(() => reject(error));
    });
    child.on("close", (code) => {
      finish(() =>
        resolve({
          code: code ?? 1,
          stderr: sanitizeErrorMessage(stderr, secrets),
          stdout: sanitizeErrorMessage(stdout, secrets),
        }),
      );
    });
  });
}

export async function sha256File(filePath: string): Promise<string> {
  const hash = createHash("sha256");
  await pipeline(createReadStream(filePath), hash);
  return hash.digest("hex");
}

export async function assertPlainPdf(bin: string, filePath: string, timeoutMs = 120_000): Promise<void> {
  const handle = await open(filePath, "r");
  const header = Buffer.alloc(5);
  await handle.read(header, 0, 5, 0);
  const stat = await handle.stat();
  await handle.close();
  if (stat.size <= 0) throw new Error("The source PDF is empty.");
  if (header.toString("utf8") !== "%PDF-") throw new Error("The file is not a PDF.");

  const encryption = await runQpdf(bin, ["--show-encryption", filePath], [], timeoutMs);
  const details = `${encryption.stdout}\n${encryption.stderr}`.toLowerCase();
  if (!details.includes("not encrypted")) {
    throw new Error("The source PDF is already encrypted or could not be inspected.");
  }
  const check = await runQpdf(bin, ["--check", filePath], [], timeoutMs);
  if (check.code !== 0 && check.code !== 3) {
    throw new Error(`The source PDF failed structural validation. ${check.stderr}`.trim());
  }
}

export async function encryptPdfFile(input: {
  sourcePath: string;
  userPassword: string;
  bits: 128 | 256;
  qpdfBin: string;
  timeoutMs?: number;
}): Promise<{ outputPath: string; directory: string; encryptedSha256: string; encryptedSize: number }> {
  const timeoutMs = input.timeoutMs ?? 120_000;
  const directory = await mkdtemp(path.join(tmpdir(), "magnum-encrypt-"));
  trackWorkingDirectory(directory);
  const outputPath = path.join(directory, "encrypted.pdf");
  const ownerPassword = randomBytes(32).toString("base64url");
  const secrets = [input.userPassword, ownerPassword];
  try {
    const check = await runQpdf(input.qpdfBin, ["--check", input.sourcePath], secrets, timeoutMs);
    if (check.code === 2) {
      throw new Error(`PDF failed structural validation. ${check.stderr}`.trim());
    }
    const args = buildEncryptArgs({
      bits: input.bits,
      inputPath: input.sourcePath,
      outputPath,
      userPassword: input.userPassword,
      ownerPassword,
    });
    const encrypted = await runQpdf(input.qpdfBin, args, secrets, timeoutMs);
    if (encrypted.code !== 0) {
      throw new Error(`PDF encryption failed. ${encrypted.stderr}`.trim());
    }
    await assertOpens(input.qpdfBin, outputPath, input.userPassword, directory);
    await assertRejectsWrongPassword(input.qpdfBin, outputPath, `${input.userPassword}-wrong`, directory);
    const encryptedSha256 = await sha256File(outputPath);
    const handle = await open(outputPath, "r");
    const stat = await handle.stat();
    await handle.close();
    return { outputPath, directory, encryptedSha256, encryptedSize: Number(stat.size) };
  } catch (error) {
    await discardWorkingDirectory(directory);
    throw error;
  }
}

async function assertOpens(bin: string, filePath: string, password: string, directory: string): Promise<void> {
  const passwordFile = path.join(directory, "open-password.txt");
  const decrypted = path.join(directory, "opened.pdf");
  await writeFile(passwordFile, `${password}\n`, { mode: 0o600 });
  const result = await runQpdf(bin, [`--password-file=${passwordFile}`, "--decrypt", filePath, decrypted], [password]);
  if (result.code !== 0) {
    throw new Error("Encrypted PDF did not open with the folio password.");
  }
  const handle = await open(decrypted, "r");
  const header = Buffer.alloc(5);
  await handle.read(header, 0, 5, 0);
  await handle.close();
  if (header.toString("utf8") !== "%PDF-") {
    throw new Error("Decrypted output is not a PDF.");
  }
}

async function assertRejectsWrongPassword(bin: string, filePath: string, password: string, directory: string): Promise<void> {
  const passwordFile = path.join(directory, "wrong-password.txt");
  const decrypted = path.join(directory, "rejected.pdf");
  await writeFile(passwordFile, `${password}\n`, { mode: 0o600 });
  const result = await runQpdf(bin, [`--password-file=${passwordFile}`, "--decrypt", filePath, decrypted], [password]);
  if (result.code === 0) {
    throw new Error("PDF was not password protected.");
  }
}

export function pdfPasswordFromFolio(normalizedFolio: string, policy: "folio"): string {
  if (policy !== "folio") {
    throw new Error("Only the folio password policy is configured.");
  }
  return normalizedFolio;
}
