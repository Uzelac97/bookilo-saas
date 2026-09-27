import type { UserRole } from "@prisma/client";

import { prisma } from "./prisma";

// Re-exported so app code can name the role type without importing
// @prisma/client, which the no-restricted-imports rule bans outside lib/db/**.
export type { UserRole };

/**
 * The credentials-login lookup.
 *
 * This is the one helper in lib/db/* that does NOT take a tenantId, and that is
 * deliberate: at login time there is no session yet, so there is no tenant to
 * scope by. The email is what resolves the tenant — `User.email` is globally
 * unique across the app (EXECUTION-PLAN.md §3: one email maps to exactly one
 * tenant for MVP), so this returns at most one row and that row carries the
 * tenantId every later query scopes by.
 *
 * Do not treat this as precedent. Every other helper here takes tenantId.
 *
 * Selects only what `authorize` needs — passwordHash must never travel further
 * than the auth callback that compares it.
 */
export async function getUserByEmail(email: string): Promise<{
  id: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  tenantId: string;
} | null> {
  return prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      passwordHash: true,
      role: true,
      tenantId: true,
    },
  });
}

/**
 * Re-reads the user a session JWT names, scoped by the tenant that JWT names.
 *
 * Exists because the session is a stateless JWT (no Session table —
 * EXECUTION-PLAN.md §3): once issued, it stays valid until it expires, whatever
 * happens to the user it was issued for. Without a lookup, a deleted user or a
 * user whose role changed keeps acting on the dashboard for the token's whole
 * lifetime. lib/auth/session.ts calls this once per request.
 *
 * `tenantId` is in the `where` alongside the id, so a token whose userId and
 * tenantId don't belong together resolves to null rather than to a user of some
 * other shop.
 *
 * Returns the role from the database, not the JWT's copy of it — the whole point
 * is that the token's claims can be stale.
 */
export async function getSessionUser(
  tenantId: string,
  userId: string,
): Promise<{ id: string; role: UserRole } | null> {
  return prisma.user.findFirst({
    where: { id: userId, tenantId },
    select: { id: true, role: true },
  });
}
