export function collapseWhitespace(input: string): string {
  return input.normalize("NFKC").trim().replace(/\s+/g, " ");
}

export function normalizeName(input: string): string {
  return collapseWhitespace(input).toLocaleLowerCase("en-US");
}

/**
 * Folio identifiers stay strings. Leading zeros are preserved.
 * Internal whitespace is removed and letters are uppercased so matching is stable.
 * The PDF open password uses this same value.
 */
export function normalizeFolio(input: string): string {
  return input.normalize("NFKC").trim().replace(/\s+/g, "").toUpperCase();
}

export function namesMatch(submitted: string, storedNormalized: string): boolean {
  return normalizeName(submitted) === storedNormalized;
}

export function foliosMatch(submitted: string, storedNormalized: string): boolean {
  return normalizeFolio(submitted) === storedNormalized;
}

export function pdfMatchKey(filename: string): string {
  const normalized = filename.normalize("NFKC").trim().replace(/\\/g, "/");
  const base = normalized.split("/").pop() ?? normalized;
  return base.toLocaleLowerCase("en-US");
}

export function isSafeRelativePath(filename: string): boolean {
  if (!filename || filename.includes("\0")) return false;
  const normalized = filename.replace(/\\/g, "/");
  if (normalized.startsWith("/") || /^[a-zA-Z]:/.test(normalized)) return false;
  const parts = normalized.split("/");
  if (parts.some((part) => part === ".." || part === "")) return false;
  return true;
}
