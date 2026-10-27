import { compare, hash } from "bcryptjs";

const BCRYPT_COST = 12;
let dummyHash: string | null = null;

export async function hashPassword(password: string): Promise<string> {
  return hash(password, BCRYPT_COST);
}

export async function verifyPassword(password: string, passwordHash: string | null): Promise<boolean> {
  if (!dummyHash) {
    dummyHash = await hash("not-a-real-password", BCRYPT_COST);
  }
  return compare(password, passwordHash ?? dummyHash);
}
