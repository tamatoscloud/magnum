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

/**
 * Honorifics ignored when matching a shareholder's name. They are only removed from the
 * start of a name (repeatedly, so "Lt. Col. Abbas Khan" -> "abbas khan"), so a word like
 * "Haji" or "Dr" inside a name is left alone.
 */
export const NAME_TITLES = [
  "mr", "mrs", "miss", "ms", "msc", "mst", "mstt", "dr", "m/s", "messrs",
  "prof", "professor", "lt", "major", "maj", "col", "capt", "captain", "commander", "cdr",
  "engr", "haji", "hajee", "hafiz", "fl", "flt", "vice", "admiral", "rtd", "retd",
] as const;

const TITLE_SET = new Set<string>(NAME_TITLES);

/**
 * Key used to compare a typed name with a stored one. Case, leading titles, dots, commas,
 * hyphens and spaces are ignored: "Mr. Muhammad Ilyas", "muhammad ilyas" and
 * "MUHAMMAD-ILYAS" all give "muhammadilyas"; "N.B.P." and "NBP" both give "nbp".
 */
export function nameMatchKey(input: string): string {
  const words = input
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .split(/[\s.,()]+/)
    .map((word) => (word === "m/s" ? word : word.replace(/[^\p{L}\p{N}]/gu, "")))
    .filter(Boolean);
  while (words.length > 1 && TITLE_SET.has(words[0])) words.shift();
  return words.join("").replace(/[^\p{L}\p{N}]/gu, "");
}

export function namesMatch(submitted: string, storedNormalized: string): boolean {
  return nameMatchKey(submitted) === nameMatchKey(storedNormalized);
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
