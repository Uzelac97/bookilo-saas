import { getCurrentTenant } from "@/lib/auth/session";
import { getLocale } from "@/lib/preferences-server";
import type { Vertical } from "@/lib/vertical";

import { createTranslator, type Translator } from "./translate";

/**
 * The request's translator, for server components and generateMetadata.
 *
 * `vertical` is required on purpose, so a tenant's page can't silently render
 * barbershop wording for a salon. Pass the slug-resolved tenant's
 * `businessType` on public pages, and `null` on the few surfaces that belong to
 * no tenant (login, the root layout, an unknown shop).
 *
 * Dashboard code uses getDashboardT below instead.
 */
export async function getT(vertical: Vertical | null): Promise<Translator> {
  return createTranslator(await getLocale(), vertical ?? undefined);
}

/**
 * The translator for the owner dashboard, in the signed-in tenant's vertical.
 *
 * Resolves the tenant from the session (getCurrentTenant, memoized per
 * request), so it belongs under (dashboard)/ only. Public pages resolve their
 * tenant from the URL slug and pass it to getT — the two resolution paths never
 * mix (CLAUDE.md rule 2).
 */
export async function getDashboardT(): Promise<Translator> {
  const [locale, tenant] = await Promise.all([getLocale(), getCurrentTenant()]);
  return createTranslator(locale, tenant.businessType);
}
