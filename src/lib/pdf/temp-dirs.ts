import { readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const PREFIXES = ["magnum-encrypt-", "magnum-campaign-"];
const active = new Set<string>();

export function isAllowedWorkingDirectory(directory: string): boolean {
  const root = path.resolve(tmpdir());
  const resolved = path.resolve(directory);
  if (resolved === root || !resolved.startsWith(root + path.sep)) return false;
  const name = path.basename(resolved);
  return PREFIXES.some((prefix) => name.startsWith(prefix));
}

export function trackWorkingDirectory(directory: string): void {
  if (!isAllowedWorkingDirectory(directory)) throw new Error("Temporary directory is outside the allowlist.");
  active.add(path.resolve(directory));
}

export function untrackWorkingDirectory(directory: string): void {
  active.delete(path.resolve(directory));
}

export function isWorkingDirectoryActive(directory: string): boolean {
  return active.has(path.resolve(directory));
}

export async function discardWorkingDirectory(directory: string): Promise<void> {
  untrackWorkingDirectory(directory);
  if (!isAllowedWorkingDirectory(directory)) return;
  await rm(path.resolve(directory), { recursive: true, force: true });
}

export async function sweepStaleWorkingDirectories(maxAgeMs: number, now = Date.now()): Promise<number> {
  const root = path.resolve(tmpdir());
  let removed = 0;
  let names: string[] = [];
  try {
    names = await readdir(root);
  } catch {
    return 0;
  }
  for (const name of names) {
    if (!PREFIXES.some((prefix) => name.startsWith(prefix))) continue;
    const full = path.join(root, name);
    if (!isAllowedWorkingDirectory(full) || isWorkingDirectoryActive(full)) continue;
    try {
      const info = await stat(full);
      if (!info.isDirectory()) continue;
      if (now - info.mtimeMs < maxAgeMs) continue;
      await rm(full, { recursive: true, force: true });
      removed += 1;
    } catch {
      continue;
    }
  }
  return removed;
}
