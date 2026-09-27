import { redirect } from "next/navigation";
import { cache } from "react";

import { getTenantById } from "@/lib/db/tenant";
import { getSessionUser, type UserRole } from "@/lib/db/users";

import { auth } from "./auth";

export type SessionContext = {
  userId: string;
  tenantId: string;
  role: UserRole;
};

/**
 * The session, or null when signed out. Use when "signed out" is a valid state.
 *
 * NOT JUST A JWT DECODE. The token is stateless, so on its own it can't know
 * that the user it names has since been deleted or changed role — and it stays
 * valid for its whole lifetime regardless. So the user row is re-read, scoped by
 * the token's tenant (getSessionUser), and anything that doesn't check out is
 * treated as signed out:
 *
 * - no such user in that tenant: deleted, or a token whose ids don't belong
 *   together.
 * - role other than OWNER: the dashboard and every action behind it are owner
 *   functions, and there is no staff-facing surface yet. Failing closed means a
 *   STAFF row, whenever one first exists, gets nothing rather than everything.
 *
 * What this does NOT catch: a password reset. The user row still exists with the
 * same role, so a session issued before the reset stays valid. Closing that
 * needs a per-user token version, which is a schema change — see
 * EXECUTION-PLAN.md.
 *
 * Memoized per request. A dashboard render asks for the session several times
 * over — the layout guards on it, the page reads the tenant from it, a server
 * action re-checks it — and without this each one is a separate JWT decode and
 * user query.
 *
 * cache() is safe *here* specifically because this module only ever runs inside
 * a request: it calls auth() and redirect(), neither of which exists outside one.
 * The same wrapper does not belong in lib/db/**, which also runs from the seed
 * script and the probes, where there is no React scope to memoize into — see the
 * getShop comment in app/(public)/b/[slug]/page.tsx.
 */
export const getSession = cache(async () => {
  const session = await auth();
  if (!session?.user?.tenantId || !session.user.id) return null;

  const user = await getSessionUser(session.user.tenantId, session.user.id);
  if (!user || user.role !== "OWNER") return null;

  return session;
});

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
