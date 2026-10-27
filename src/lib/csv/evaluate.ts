import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";
import { z } from "zod";
import { collapseWhitespace, isSafeRelativePath, normalizeFolio, normalizeName, pdfMatchKey } from "@/lib/security/normalize";

export const CANONICAL_FIELDS = ["customer_name", "folio_number", "email", "phone_number", "pdf_filename"] as const;

export type CanonicalField = (typeof CANONICAL_FIELDS)[number];

export type ColumnMapping = Record<CanonicalField, string>;

const ALIASES: Record<CanonicalField, string[]> = {
  customer_name: ["customer_name", "customer name", "name", "full_name", "full name", "shareholder_name", "shareholder name"],
  folio_number: ["folio_number", "folio number", "folio no", "folio_no", "folio", "folio no."],
  email: ["email", "email address", "e-mail", "email_address"],
  phone_number: ["phone_number", "phone number", "phone", "mobile", "mobile number", "mobile_number", "whatsapp"],
  pdf_filename: ["pdf_filename", "pdf filename", "pdf name", "pdf_name", "pdf", "filename", "file_name", "file name"],
};

export type ParsedCsv = {
  headers: string[];
  records: Array<Record<string, string>>;
};

export type RawMappedRow = {
  rowNumber: number;
  customerName: string;
  folioNumber: string;
  email: string;
  phoneNumber: string;
  pdfFilename: string;
};

export type ImportIssue = {
  rowNumber: number | null;
  field: string | null;
  code: string;
  message: string;
  severity: "ERROR" | "WARNING";
};

export type EvaluatedRow = {
  rowNumber: number;
  customerName: string;
  normalizedCustomerName: string;
  folioNumber: string;
  normalizedFolioNumber: string;
  email: string | null;
  phoneNumber: string | null;
  sourcePdfFilename: string;
  zipEntryName: string | null;
  isValid: boolean;
};

export type ZipEntryInfo = {
  fileName: string;
  baseName: string;
  matchKey: string;
  compressedSize: number;
  uncompressedSize: number;
  safe: boolean;
  isPdfName: boolean;
  reason?: string;
};

const emailSchema = z.string().trim().email().max(320);

function headerKey(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase("en-US").replace(/\s+/g, " ");
}

export function suggestMapping(headers: string[]): Partial<ColumnMapping> {
  const mapping: Partial<ColumnMapping> = {};
  const used = new Set<string>();
  for (const field of CANONICAL_FIELDS) {
    const aliases = new Set(ALIASES[field]);
    const match = headers.find((header) => aliases.has(headerKey(header)) && !used.has(header));
    if (match) {
      mapping[field] = match;
      used.add(match);
    }
  }
  return mapping;
}

export function assertMapping(headers: string[], mapping: Partial<ColumnMapping>): ColumnMapping {
  const headerSet = new Set(headers);
  const resolved = {} as ColumnMapping;
  for (const field of CANONICAL_FIELDS) {
    const column = mapping[field];
    if (!column || !headerSet.has(column)) {
      throw new Error(`Map a CSV column to ${field}`);
    }
    resolved[field] = column;
  }
  return resolved;
}

export function mapRecords(records: Array<Record<string, string>>, mapping: ColumnMapping): RawMappedRow[] {
  return records.map((record, index) => ({
    rowNumber: index + 2,
    customerName: record[mapping.customer_name] ?? "",
    folioNumber: record[mapping.folio_number] ?? "",
    email: record[mapping.email] ?? "",
    phoneNumber: record[mapping.phone_number] ?? "",
    pdfFilename: record[mapping.pdf_filename] ?? "",
  }));
}

export type EvaluateOptions = {
  phoneRegion: string;
  entries: ZipEntryInfo[];
};

export function evaluateImport(rows: RawMappedRow[], options: EvaluateOptions): {
  rows: EvaluatedRow[];
  issues: ImportIssue[];
  totalRecords: number;
  validRecords: number;
  invalidRecords: number;
} {
  const issues: ImportIssue[] = [];
  const folioOwners = new Map<string, number[]>();
  const filenameOwners = new Map<string, number[]>();

  for (const row of rows) {
    const folio = normalizeFolio(row.folioNumber);
    if (folio) {
      const list = folioOwners.get(folio) ?? [];
      list.push(row.rowNumber);
      folioOwners.set(folio, list);
    }
    const key = row.pdfFilename.trim() ? pdfMatchKey(row.pdfFilename) : "";
    if (key) {
      const list = filenameOwners.get(key) ?? [];
      list.push(row.rowNumber);
      filenameOwners.set(key, list);
    }
  }

  const safeEntries = options.entries.filter((entry) => entry.safe);
  const entriesByKey = new Map<string, ZipEntryInfo[]>();
  for (const entry of safeEntries) {
    const list = entriesByKey.get(entry.matchKey) ?? [];
    list.push(entry);
    entriesByKey.set(entry.matchKey, list);
  }

  for (const entry of options.entries) {
    if (!entry.safe) {
      issues.push({
        rowNumber: null,
        field: "zip",
        code: entry.reason === "path-traversal" ? "UNSAFE_PATH" : "INVALID_ZIP_ENTRY",
        message: `Rejected archive entry "${entry.fileName}": ${entry.reason ?? "unsafe"}`,
        severity: "ERROR",
      });
    }
  }

  const referencedKeys = new Set<string>();
  const evaluated: EvaluatedRow[] = rows.map((row) => {
    const rowIssues: ImportIssue[] = [];
    const displayName = collapseWhitespace(row.customerName);
    const normalizedCustomerName = normalizeName(row.customerName);
    const folioNumber = row.folioNumber.normalize("NFKC").trim();
    const normalizedFolioNumber = normalizeFolio(row.folioNumber);
    const filename = row.pdfFilename.normalize("NFKC").trim();
    const matchKey = filename ? pdfMatchKey(filename) : "";

    if (displayName.length < 2) {
      rowIssues.push(issue(row.rowNumber, "customer_name", "MISSING_FIELD", "Customer name is required."));
    }
    if (!normalizedFolioNumber || !/^[A-Z0-9][A-Z0-9/_-]{0,63}$/.test(normalizedFolioNumber)) {
      rowIssues.push(
        issue(row.rowNumber, "folio_number", "MISSING_FIELD", "Folio number is missing or contains unsupported characters."),
      );
    }
    if ((folioOwners.get(normalizedFolioNumber)?.length ?? 0) > 1) {
      rowIssues.push(issue(row.rowNumber, "folio_number", "DUPLICATE_FOLIO", "Folio number is duplicated in this file."));
    }
    if (!filename || !isSafeRelativePath(filename) || !filename.toLowerCase().endsWith(".pdf")) {
      rowIssues.push(issue(row.rowNumber, "pdf_filename", "MISSING_FIELD", "A PDF filename ending in .pdf is required."));
    } else if ((filenameOwners.get(matchKey)?.length ?? 0) > 1) {
      rowIssues.push(issue(row.rowNumber, "pdf_filename", "DUPLICATE_FILENAME", "PDF filename is duplicated in this file."));
    }

    let email: string | null = null;
    const rawEmail = row.email.trim();
    if (!rawEmail) {
      issues.push({
        rowNumber: row.rowNumber,
        field: "email",
        code: "MISSING_EMAIL",
        message: "Email is empty, so email delivery will be skipped.",
        severity: "WARNING",
      });
    } else {
      const parsed = emailSchema.safeParse(rawEmail);
      if (!parsed.success) {
        rowIssues.push(issue(row.rowNumber, "email", "INVALID_EMAIL", "Email address is invalid."));
      } else {
        email = parsed.data.toLocaleLowerCase("en-US");
      }
    }

    let phoneNumber: string | null = null;
    const rawPhone = row.phoneNumber.trim();
    if (!rawPhone) {
      issues.push({
        rowNumber: row.rowNumber,
        field: "phone_number",
        code: "MISSING_PHONE",
        message: "Phone number is empty, so WhatsApp delivery will be skipped.",
        severity: "WARNING",
      });
    } else {
      const parsed = parsePhoneNumberFromString(rawPhone, options.phoneRegion as CountryCode);
      if (!parsed?.isValid()) {
        rowIssues.push(issue(row.rowNumber, "phone_number", "INVALID_PHONE", "Phone number is not a valid international number."));
      } else {
        phoneNumber = parsed.number;
      }
    }

    let zipEntryName: string | null = null;
    if (matchKey && filename.toLowerCase().endsWith(".pdf")) {
      referencedKeys.add(matchKey);
      const matches = entriesByKey.get(matchKey) ?? [];
      if (matches.length === 0) {
        rowIssues.push(issue(row.rowNumber, "pdf_filename", "MISSING_PDF", `No PDF named ${filename} was found in the archive.`));
      } else if (matches.length > 1) {
        rowIssues.push(issue(row.rowNumber, "pdf_filename", "DUPLICATE_FILENAME", `More than one archive entry matches ${filename}.`));
      } else {
        const entry = matches[0];
        if (!entry) {
          rowIssues.push(issue(row.rowNumber, "pdf_filename", "MISSING_PDF", `No PDF named ${filename} was found in the archive.`));
        } else if (entry.uncompressedSize <= 0) {
          rowIssues.push(issue(row.rowNumber, "pdf_filename", "INVALID_PDF", "The matched PDF is empty."));
        } else {
          zipEntryName = entry.fileName;
        }
      }
    }

    issues.push(...rowIssues);
    return {
      rowNumber: row.rowNumber,
      customerName: displayName,
      normalizedCustomerName,
      folioNumber,
      normalizedFolioNumber,
      email,
      phoneNumber,
      sourcePdfFilename: filename,
      zipEntryName,
      isValid: rowIssues.length === 0,
    };
  });

  for (const [key, entries] of entriesByKey) {
    if (referencedKeys.has(key)) continue;
    for (const entry of entries) {
      if (!entry.isPdfName) {
        issues.push({
          rowNumber: null,
          field: "zip",
          code: "UNSUPPORTED_FILE",
          message: `Archive entry ${entry.fileName} is not a PDF and was ignored.`,
          severity: "WARNING",
        });
        continue;
      }
      issues.push({
        rowNumber: null,
        field: "zip",
        code: "ORPHAN_PDF",
        message: `Archive PDF ${entry.fileName} is not referenced by the CSV.`,
        severity: "WARNING",
      });
    }
  }

  const validRecords = evaluated.filter((row) => row.isValid).length;
  return {
    rows: evaluated,
    issues,
    totalRecords: evaluated.length,
    validRecords,
    invalidRecords: evaluated.length - validRecords,
  };
}

function issue(rowNumber: number, field: string, code: string, message: string): ImportIssue {
  return { rowNumber, field, code, message, severity: "ERROR" };
}

export function issuesToCsv(issues: ImportIssue[]): string {
  const lines = ["row_number,field,code,severity,message"];
  for (const item of issues) {
    lines.push(
      [
        item.rowNumber ?? "",
        csvCell(item.field ?? ""),
        csvCell(item.code),
        item.severity,
        csvCell(item.message),
      ].join(","),
    );
  }
  return `${lines.join("\n")}\n`;
}

export function csvCell(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}
