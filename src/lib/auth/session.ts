import { redirect } from "next/navigation";

import { getTenantById } from "@/lib/db/tenant";
import type { UserRole } from "@/lib/db/users";

import { auth } from "./auth";

export type SessionContext = {
  userId: string;
  tenantId: string;
  role: UserRole;
};

/** Raw session, or null when signed out. Use when "signed out" is a valid state. */
export async function getSession() {
  return auth();
}

/**
 * The tenant context for an authenticated request. This is the ONLY approved
 * source of tenantId for dashboard reads and mutations — CLAUDE.md rule 2. A
 * server action must never take a tenantId from form data or a request body.
 *
 * Redirects to /login if there's no session. proxy.ts already blocks
 * unauthenticated /dashboard requests; this is the second line of defence for
 * server actions, which proxy.ts does not cover.
 */
export async function requireSession(): Promise<SessionContext> {
  const session = await getSession();

  if (!session?.user?.tenantId) {
    redirect("/login");
  }

  return {
    userId: session.user.id,
    tenantId: session.user.tenantId,
    role: session.user.role,
  };
}

/** The signed-in owner's tenant record. Throws if the row vanished mid-session. */
export async function getCurrentTenant() {
  const { tenantId } = await requireSession();
  const tenant = await getTenantById(tenantId);

  if (!tenant) {
    // A valid JWT pointing at a deleted tenant. Failing loudly beats handing
    // back null and letting a caller treat it as "no data yet".
    throw new Error(`Session references a tenant that no longer exists: ${tenantId}`);
  }

  return tenant;
}
