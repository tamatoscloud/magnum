import { parse } from "csv-parse/sync";

export type CsvTable = {
  headers: string[];
  records: Array<Record<string, string>>;
};

export function parseCsvContent(content: string): CsvTable {
  if (content.includes("\0")) {
    throw new Error("CSV contains binary data and is not a text file.");
  }
  const withoutBom = content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;
  let records: Array<Record<string, string>>;
  try {
    records = parse(withoutBom, {
      columns: true,
      skip_empty_lines: true,
      bom: true,
      relax_column_count: false,
      trim: false,
    }) as Array<Record<string, string>>;
  } catch {
    throw new Error("CSV could not be parsed. Check the header row, quoting, and UTF-8 encoding.");
  }

  if (records.length === 0) {
    throw new Error("CSV does not contain any data rows.");
  }

  const headers = Object.keys(records[0] ?? {});
  if (headers.length === 0 || headers.some((header) => header.trim() === "")) {
    throw new Error("CSV header row is missing or contains an empty column name.");
  }

  return {
    headers,
    records: records.map((record) => {
      const normalized: Record<string, string> = {};
      for (const [key, value] of Object.entries(record)) {
        normalized[key] = typeof value === "string" ? value : "";
      }
      return normalized;
    }),
  };
}

export function decodeCsvBuffer(buffer: Buffer): string {
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    throw new Error("CSV must be UTF-8. UTF-16 files are not accepted.");
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    throw new Error("CSV must be valid UTF-8.");
  }
}
