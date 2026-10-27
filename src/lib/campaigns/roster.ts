import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";
import { z } from "zod";
import { collapseWhitespace, normalizeFolio, normalizeName } from "@/lib/security/normalize";

export const CAMPAIGN_FIELDS = ["customer_name", "folio_number", "email", "phone_number"] as const;
export type CampaignField = (typeof CAMPAIGN_FIELDS)[number];
export type CampaignMapping = Partial<Record<CampaignField, string>> & Pick<Record<CampaignField, string>, "customer_name" | "folio_number">;

const ALIASES: Record<CampaignField, string[]> = {
  customer_name: ["customer_name", "customer name", "name", "full_name", "full name", "shareholder_name", "shareholder name"],
  folio_number: ["folio_number", "folio number", "folio no", "folio_no", "folio", "folio no."],
  email: ["email", "email address", "e-mail", "email_address"],
  phone_number: ["phone_number", "phone number", "phone", "mobile", "mobile number", "mobile_number", "whatsapp"],
};

const emailSchema = z.string().trim().email().max(320);
const folioPattern = /^[A-Z0-9][A-Z0-9/_-]{0,63}$/;

export type CampaignIssue = {
  rowNumber: number | null;
  field: string | null;
  code: string;
  message: string;
  severity: "ERROR" | "WARNING";
};

export type CampaignRosterRow = {
  rowNumber: number;
  customerName: string;
  normalizedCustomerName: string;
  folioNumber: string;
  normalizedFolioNumber: string;
  email: string | null;
  phoneNumber: string | null;
  isValid: boolean;
};

function headerKey(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase("en-US").replace(/\s+/g, " ");
}

export function suggestCampaignMapping(headers: string[]): Partial<Record<CampaignField, string>> {
  const mapping: Partial<Record<CampaignField, string>> = {};
  const used = new Set<string>();
  for (const field of CAMPAIGN_FIELDS) {
    const aliases = new Set(ALIASES[field]);
    const match = headers.find((header) => aliases.has(headerKey(header)) && !used.has(header));
    if (match) {
      mapping[field] = match;
      used.add(match);
    }
  }
  return mapping;
}

export function assertCampaignMapping(headers: string[], mapping: Partial<Record<CampaignField, string>>): CampaignMapping {
  const headerSet = new Set(headers);
  const customer = mapping.customer_name;
  const folio = mapping.folio_number;
  if (!customer || !headerSet.has(customer)) throw new Error("Map a CSV column to customer_name");
  if (!folio || !headerSet.has(folio)) throw new Error("Map a CSV column to folio_number");
  const resolved: CampaignMapping = { customer_name: customer, folio_number: folio };
  if (mapping.email && headerSet.has(mapping.email)) resolved.email = mapping.email;
  if (mapping.phone_number && headerSet.has(mapping.phone_number)) resolved.phone_number = mapping.phone_number;
  return resolved;
}

export function campaignCanActivate(input: {
  status: string;
  sourceSha256: string | null;
  validRecords: number;
  blockingIssues: number;
}): boolean {
  return input.status === "READY" && Boolean(input.sourceSha256) && input.validRecords > 0 && input.blockingIssues === 0;
}

export function evaluateCampaignRoster(
  records: Array<Record<string, string>>,
  mapping: CampaignMapping,
  phoneRegion: string,
): { rows: CampaignRosterRow[]; issues: CampaignIssue[] } {
  const issues: CampaignIssue[] = [];
  const mapped = records.map((record, index) => ({
    rowNumber: index + 2,
    customerName: record[mapping.customer_name] ?? "",
    folioNumber: record[mapping.folio_number] ?? "",
    email: mapping.email ? (record[mapping.email] ?? "") : "",
    phoneNumber: mapping.phone_number ? (record[mapping.phone_number] ?? "") : "",
  }));
  const folioOwners = new Map<string, number[]>();
  for (const row of mapped) {
    const folio = normalizeFolio(row.folioNumber);
    if (!folio) continue;
    const owners = folioOwners.get(folio) ?? [];
    owners.push(row.rowNumber);
    folioOwners.set(folio, owners);
  }

  const rows = mapped.map((row) => {
    const rowIssues: CampaignIssue[] = [];
    const displayName = collapseWhitespace(row.customerName);
    const normalizedCustomerName = normalizeName(row.customerName);
    const folioNumber = row.folioNumber.normalize("NFKC").trim();
    const normalizedFolioNumber = normalizeFolio(row.folioNumber);

    if (displayName.length < 2) {
      rowIssues.push({ rowNumber: row.rowNumber, field: "customer_name", code: "MISSING_FIELD", message: "Customer name is required.", severity: "ERROR" });
    }
    if (!normalizedFolioNumber || !folioPattern.test(normalizedFolioNumber)) {
      rowIssues.push({
        rowNumber: row.rowNumber,
        field: "folio_number",
        code: "MISSING_FIELD",
        message: "Folio number is missing or contains unsupported characters.",
        severity: "ERROR",
      });
    }
    if ((folioOwners.get(normalizedFolioNumber)?.length ?? 0) > 1) {
      rowIssues.push({
        rowNumber: row.rowNumber,
        field: "folio_number",
        code: "DUPLICATE_FOLIO",
        message: "Folio number is duplicated in this campaign.",
        severity: "ERROR",
      });
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
        rowIssues.push({ rowNumber: row.rowNumber, field: "email", code: "INVALID_EMAIL", message: "Email address is invalid.", severity: "ERROR" });
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
      const parsed = parsePhoneNumberFromString(rawPhone, phoneRegion as CountryCode);
      if (!parsed?.isValid()) {
        rowIssues.push({
          rowNumber: row.rowNumber,
          field: "phone_number",
          code: "INVALID_PHONE",
          message: "Phone number is not a valid international number.",
          severity: "ERROR",
        });
      } else {
        phoneNumber = parsed.number;
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
      isValid: rowIssues.length === 0,
    };
  });

  return { rows, issues };
}
