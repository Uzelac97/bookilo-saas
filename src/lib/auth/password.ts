import bcrypt from "bcryptjs";

/**
 * Password hashing, kept free of next-auth and Prisma imports on purpose:
 * prisma/seed.ts and scripts/reset-password.ts import this directly from plain
 * Node, and must not drag the whole auth stack in with it.
 */

/** One cost factor, shared by login, seed, and the reset CLI, so hashes stay comparable. */
export const BCRYPT_COST = 12;

/**
 * A valid cost-12 hash of a random string that nothing knows the plaintext of.
 * Used to burn the same ~250ms on a nonexistent email as on a wrong password —
 * without it, response latency tells an attacker which emails have accounts.
 */
export const DUMMY_PASSWORD_HASH =
  "$2b$12$.NUGSkDE1daONoA.BvwnDunmnx1I2NE.thunTScoigfyMXhmzGQhK";

export function hashPassword(plaintext: string): Promise<string> {
  return bcrypt.hash(plaintext, BCRYPT_COST);
}

export function verifyPassword(
  plaintext: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(plaintext, hash);
}
