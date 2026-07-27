import { redirect } from "next/navigation";
import { cache } from "react";

import { getTenantById } from "@/lib/db/tenant";
import type { UserRole } from "@/lib/db/users";

import { auth } from "./auth";

export type SessionContext = {
  userId: string;
  tenantId: string;
  role: UserRole;
};

/**
 * Raw session, or null when signed out. Use when "signed out" is a valid state.
 *
 * Memoized per request. A dashboard render asks for the session several times
 * over — the layout guards on it, the page reads the tenant from it, a server
 * action re-checks it — and without this each one is a separate JWT decode.
 *
 * cache() is safe *here* specifically because this module only ever runs inside
 * a request: it calls auth() and redirect(), neither of which exists outside one.
 * The same wrapper does not belong in lib/db/**, which also runs from the seed
 * script and the probes, where there is no React scope to memoize into — see the
 * getShop comment in app/(public)/b/[slug]/page.tsx.
 */
export const getSession = cache(async () => auth());

/**
 * The tenant context for an authenticated request. This is the ONLY approved
 * source of tenantId for dashboard reads and mutations — CLAUDE.md rule 2. A
 * server action must never take a tenantId from form data or a request body.
 *
 * Redirects to /login if there's no session. proxy.ts already blocks
 * unauthenticated /dashboard requests; this is the second line of defence for
 * server actions, which proxy.ts does not cover.
 *
 * Not itself wrapped in cache() — it delegates to the memoized getSession, so
 * repeat calls are already cheap, and keeping the redirect path uncached means
 * React never memoizes the thrown redirect signal.
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

/**
 * The signed-in owner's tenant record. Throws if the row vanished mid-session.
 *
 * Memoized for the same reason as getSession: the dashboard shell needs the shop
 * name for its header and the overview needs the timezone for its date math, and
 * that would otherwise be the identical query twice per render.
 */
export const getCurrentTenant = cache(async () => {
  const { tenantId } = await requireSession();
  const tenant = await getTenantById(tenantId);

  if (!tenant) {
    // A valid JWT pointing at a deleted tenant. Failing loudly beats handing
    // back null and letting a caller treat it as "no data yet".
    throw new Error(`Session references a tenant that no longer exists: ${tenantId}`);
  }

  return tenant;
});
