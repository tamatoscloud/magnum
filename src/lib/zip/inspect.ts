import { createWriteStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { isSafeRelativePath, pdfMatchKey } from "@/lib/security/normalize";
import type { ZipEntryInfo } from "@/lib/csv/evaluate";
import yauzl from "yauzl";

type ZipFile = yauzl.ZipFile;
type Entry = yauzl.Entry;

export type ZipInspectLimits = {
  maxEntries: number;
  maxUncompressedBytes: number;
  maxCompressionRatio: number;
  maxEntryBytes: number;
};

export type ZipInspection = {
  entries: ZipEntryInfo[];
  totalUncompressedBytes: number;
};

export async function inspectZip(zipPath: string, limits: ZipInspectLimits): Promise<ZipInspection> {
  const zipfile = await openZip(zipPath);
  const entries: ZipEntryInfo[] = [];
  let totalUncompressedBytes = 0;
  try {
    for await (const entry of iterateEntries(zipfile)) {
      if (/\/$/.test(entry.fileName)) continue;
      if (entries.length >= limits.maxEntries) {
        throw new Error("Archive has too many entries.");
      }
      const info = describeEntry(entry, limits);
      if (info.safe) {
        totalUncompressedBytes += entry.uncompressedSize;
        if (totalUncompressedBytes > limits.maxUncompressedBytes) {
          throw new Error("Archive uncompressed size exceeds the configured limit.");
        }
      }
      entries.push(info);
    }
  } finally {
    zipfile.close();
  }
  return { entries, totalUncompressedBytes };
}

export async function extractZipEntry(zipPath: string, entryName: string, maxBytes: number): Promise<string> {
  if (!isSafeRelativePath(entryName)) {
    throw new Error("Refusing to extract an unsafe archive path.");
  }
  const zipfile = await openZip(zipPath);
  const directory = await mkdtemp(path.join(tmpdir(), "magnum-pdf-"));
  const destination = path.join(directory, "source.pdf");
  try {
    const entry = await findEntry(zipfile, entryName);
    if (!entry) throw new Error("The PDF entry was not found in the archive.");
    if (!isSafeRelativePath(entry.fileName)) throw new Error("Refusing to extract an unsafe archive path.");
    if ((entry.generalPurposeBitFlag & 0x1) !== 0) throw new Error("Encrypted archive entries are not accepted.");
    if (entry.uncompressedSize > maxBytes) throw new Error("PDF exceeds the configured size limit.");
    await writeEntry(zipfile, entry, destination, maxBytes);
    return destination;
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  } finally {
    zipfile.close();
  }
}

export async function removeExtractedFile(filePath: string): Promise<void> {
  await rm(path.dirname(filePath), { recursive: true, force: true });
}

function describeEntry(entry: Entry, limits: ZipInspectLimits): ZipEntryInfo {
  const fileName = entry.fileName.replace(/\\/g, "/");
  const baseName = fileName.split("/").pop() ?? fileName;
  const directory = /\/$/.test(fileName);
  let reason: string | undefined;
  if (directory) reason = "directory";
  else if (!isSafeRelativePath(fileName)) reason = "path-traversal";
  else if ((entry.generalPurposeBitFlag & 0x1) !== 0) reason = "encrypted-entry";
  else if (entry.uncompressedSize > limits.maxEntryBytes) reason = "entry-too-large";
  else if (
    entry.compressedSize > 0 &&
    entry.uncompressedSize > entry.compressedSize * limits.maxCompressionRatio &&
    entry.uncompressedSize > 1_000_000
  ) {
    reason = "compression-ratio";
  }

  return {
    fileName,
    baseName,
    matchKey: pdfMatchKey(baseName),
    compressedSize: entry.compressedSize,
    uncompressedSize: entry.uncompressedSize,
    safe: !directory && !reason,
    isPdfName: baseName.toLowerCase().endsWith(".pdf"),
    reason,
  };
}

function openZip(zipPath: string): Promise<ZipFile> {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true, autoClose: false, validateEntrySizes: true, decodeStrings: true }, (error, zipfile) => {
      if (error || !zipfile) {
        reject(new Error("ZIP archive is malformed or unreadable."));
        return;
      }
      resolve(zipfile);
    });
  });
}

async function* iterateEntries(zipfile: ZipFile): AsyncGenerator<Entry> {
  const pending: Entry[] = [];
  let done = false;
  const state: { failure: Error | null } = { failure: null };
  let notify: (() => void) | null = null;

  zipfile.on("entry", (entry: Entry) => {
    pending.push(entry);
    notify?.();
  });
  zipfile.on("end", () => {
    done = true;
    notify?.();
  });
  zipfile.on("error", (error: Error) => {
    state.failure = error;
    done = true;
    notify?.();
  });
  zipfile.readEntry();

  while (!done || pending.length > 0) {
    if (pending.length === 0) {
      await new Promise<void>((resolve) => {
        notify = resolve;
      });
      notify = null;
    }
    if (state.failure) {
      const message = state.failure.message;
      if (/invalid relative path|absolute path|invalid characters in fileName/i.test(message)) {
        throw new Error("Archive contains an unsafe path.");
      }
      throw new Error("ZIP archive is malformed or unreadable.");
    }
    const entry = pending.shift();
    if (!entry) continue;
    yield entry;
    if (!/\/$/.test(entry.fileName)) {
      zipfile.readEntry();
    } else {
      zipfile.readEntry();
    }
  }
}

function findEntry(zipfile: ZipFile, entryName: string): Promise<Entry | null> {
  return new Promise((resolve, reject) => {
    const finish = (entry: Entry | null) => {
      zipfile.removeAllListeners("entry");
      zipfile.removeAllListeners("end");
      zipfile.removeAllListeners("error");
      resolve(entry);
    };
    zipfile.on("entry", (entry: Entry) => {
      if (entry.fileName.replace(/\\/g, "/") === entryName) finish(entry);
      else zipfile.readEntry();
    });
    zipfile.on("end", () => finish(null));
    zipfile.on("error", (error: Error) => reject(error));
    zipfile.readEntry();
  });
}

export async function readPdfMagic(zipPath: string, entryNames: string[], maxBytes: number): Promise<Map<string, boolean>> {
  const wanted = new Set(entryNames);
  const result = new Map<string, boolean>();
  if (wanted.size === 0) return result;
  const zipfile = await openZip(zipPath);
  try {
    for await (const entry of iterateEntries(zipfile)) {
      const name = entry.fileName.replace(/\\/g, "/");
      if (!wanted.has(name)) continue;
      const header = await readLimited(zipfile, entry, 5, maxBytes);
      result.set(name, header.subarray(0, 5).toString("utf8") === "%PDF-");
      if (result.size === wanted.size) break;
    }
  } finally {
    zipfile.close();
  }
  return result;
}

function readLimited(zipfile: ZipFile, entry: Entry, keep: number, maxBytes: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    zipfile.openReadStream(entry, (error, stream) => {
      if (error || !stream) {
        reject(error ?? new Error("Unable to read the archive entry."));
        return;
      }
      const chunks: Buffer[] = [];
      let seen = 0;
      stream.on("data", (chunk: Buffer) => {
        seen += chunk.length;
        if (chunks.reduce((sum, item) => sum + item.length, 0) < keep) chunks.push(chunk);
        if (seen > maxBytes) stream.destroy(new Error("Archive entry exceeded the size limit."));
      });
      stream.on("error", reject);
      stream.on("end", () => resolve(Buffer.concat(chunks).subarray(0, keep)));
    });
  });
}

function writeEntry(zipfile: ZipFile, entry: Entry, destination: string, maxBytes: number): Promise<void> {
  return new Promise((resolve, reject) => {
    zipfile.openReadStream(entry, (error, stream) => {
      if (error || !stream) {
        reject(error ?? new Error("Unable to read the archive entry."));
        return;
      }
      let seen = 0;
      stream.on("data", (chunk: Buffer) => {
        seen += chunk.length;
        if (seen > maxBytes || seen > entry.uncompressedSize + 1) {
          stream.destroy(new Error("Archive entry exceeded its declared size."));
        }
      });
      pipeline(stream, createWriteStream(destination)).then(resolve).catch(reject);
    });
  });
}
