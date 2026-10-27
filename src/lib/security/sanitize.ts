const BLOCKED_KEYS = new Set([
  "token",
  "rawtoken",
  "accesstoken",
  "password",
  "pdfpassword",
  "ownerpassword",
  "secret",
  "authorization",
  "cookie",
  "sessiontoken",
  "tokenciphertext",
  "apikey",
  "accesstoken",
]);

function isBlocked(key: string): boolean {
  const compact = key.toLowerCase().replace(/[^a-z]/g, "");
  return BLOCKED_KEYS.has(compact) || compact.includes("password") || compact.includes("secret");
}

export function sanitizeMetadata(input: unknown, depth = 0): unknown {
  if (depth > 4) return "[truncated]";
  if (input === null || input === undefined) return null;
  if (typeof input === "number" || typeof input === "boolean") return input;
  if (typeof input === "string") {
    if (input.length > 180) return `${input.slice(0, 180)}…`;
    return input;
  }
  if (Array.isArray(input)) {
    return input.slice(0, 20).map((item) => sanitizeMetadata(item, depth + 1));
  }
  if (typeof input === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input)) {
      if (isBlocked(key)) continue;
      output[key] = sanitizeMetadata(value, depth + 1);
    }
    return output;
  }
  return null;
}

export function sanitizeErrorMessage(message: string, secrets: string[] = []): string {
  let output = message;
  for (const secret of secrets) {
    if (secret.length >= 4) output = output.split(secret).join("[redacted]");
  }
  return output.replace(/password[=:]\s*\S+/gi, "password=[redacted]").slice(0, 400);
}
