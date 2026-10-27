import { describe, expect, it } from "vitest";
import { evaluateImport, issuesToCsv, mapRecords, suggestMapping, type ZipEntryInfo } from "@/lib/csv/evaluate";
import { decodeCsvBuffer, parseCsvContent } from "@/lib/csv/parse";

const csv = `customer_name,folio_number,email,phone_number,pdf_filename
Ahmed Khan,MAG001245,ahmed@example.com,+923001234567,MAG001245.pdf
Sara Ali,MAG001245,sara@example.com,+923001234568,MAG001246.pdf
,00123,not-an-email,123,missing.pdf
`;

function entry(name: string): ZipEntryInfo {
  return {
    fileName: name,
    baseName: name,
    matchKey: name.toLowerCase(),
    compressedSize: 100,
    uncompressedSize: 200,
    safe: true,
    isPdfName: name.endsWith(".pdf"),
  };
}

describe("csv import", () => {
  it("parses headers and suggests alternate column names", () => {
    const table = parseCsvContent(decodeCsvBuffer(Buffer.from(csv, "utf8")));
    expect(table.headers).toContain("folio_number");
    expect(suggestMapping(["Name", "Folio No", "Mobile", "Email", "PDF Name"])).toMatchObject({
      customer_name: "Name",
      folio_number: "Folio No",
      phone_number: "Mobile",
      pdf_filename: "PDF Name",
    });
  });

  it("flags duplicate folios, invalid contacts, and missing pdfs", () => {
    const table = parseCsvContent(csv);
    const mapping = suggestMapping(table.headers);
    const rows = mapRecords(table.records, mapping as Required<typeof mapping>);
    const result = evaluateImport(rows, {
      phoneRegion: "PK",
      entries: [entry("MAG001245.pdf")],
    });
    expect(result.totalRecords).toBe(3);
    expect(result.validRecords).toBe(0);
    expect(result.issues.some((issue) => issue.code === "DUPLICATE_FOLIO")).toBe(true);
    expect(result.issues.some((issue) => issue.code === "INVALID_EMAIL")).toBe(true);
    expect(result.issues.some((issue) => issue.code === "MISSING_PDF")).toBe(true);
    expect(issuesToCsv(result.issues)).toContain("row_number");
  });

  it("accepts a complete unique row and normalizes the phone number", () => {
    const table = parseCsvContent(`customer_name,folio_number,email,phone_number,pdf_filename
Ahmed Khan,MAG001245,ahmed@example.com,03001234567,MAG001245.pdf
`);
    const mapping = suggestMapping(table.headers) as Required<ReturnType<typeof suggestMapping>>;
    const result = evaluateImport(mapRecords(table.records, mapping), {
      phoneRegion: "PK",
      entries: [entry("MAG001245.pdf")],
    });
    expect(result.validRecords).toBe(1);
    expect(result.rows[0]?.phoneNumber).toBe("+923001234567");
    expect(result.rows[0]?.normalizedFolioNumber).toBe("MAG001245");
  });
});
