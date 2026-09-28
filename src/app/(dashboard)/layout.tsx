import type { Metadata } from "next";
import Link from "next/link";

import { DashboardNav } from "@/components/dashboard/dashboard-nav";
import { VerticalProvider } from "@/components/i18n/vertical-provider";
import { PreferenceToggles } from "@/components/preferences/preference-toggles";
import { getCurrentTenant, requireSession } from "@/lib/auth/session";
import { getDashboardT } from "@/lib/i18n/server";
import { getTheme } from "@/lib/preferences-server";

import { signOutAction } from "./actions";

/**
 * The brand suffix lives on this layout rather than the root one so it applies
 * to the owner-facing subtree only. The public shop pages under (public)/b/
 * keep titles that are purely the shop's name — see the note in app/layout.tsx.
 */
export const metadata: Metadata = {
  title: { default: "Bookilo", template: "%s · Bookilo" },
};

/**
 * The owner dashboard's shell: auth guard, header, nav.
 *
 * requireSession() stays here rather than in each page. proxy.ts already
 * redirects unauthenticated requests, but that can be bypassed by a mistake in
 * the matcher — this makes the guard structural rather than configuration-shaped.
 *
 * getCurrentTenant() is memoized per request (lib/auth/session.ts), so the pages
 * below can ask for the tenant again without a second query.
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireSession();
  const tenant = await getCurrentTenant();
  const [t, theme] = await Promise.all([getDashboardT(), getTheme()]);

  return (
    <VerticalProvider vertical={tenant.businessType}>
      <div className="flex flex-1 flex-col bg-canvas">
        <header className="border-b border-line bg-surface">
          {/* NO max-width, deliberately. The calendar runs far wider than the
              other pages' max-w-5xl column, so no header width lines up with all
              five; full-width app chrome that lines up with nothing is the
              consistent choice. Options and cost: "Dashboard header inset" in
              EXECUTION-PLAN.md. */}
          <div className="flex w-full flex-col gap-4 px-4 py-4 sm:px-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-col">
                <span className="text-base font-semibold tracking-tight text-fg">
                  {tenant.name}
                </span>
                <Link
                  href={`/b/${tenant.slug}`}
                  className="w-fit text-sm text-fg-muted underline-offset-4 hover:text-fg hover:underline"
                >
                  {t("dashboard.viewPublicPage")}
                </Link>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <PreferenceToggles theme={theme} />
                <form action={signOutAction}>
                  <button
                    type="submit"
                    className="rounded-lg border border-line-strong bg-surface px-3 py-1.5 text-sm font-medium text-fg-secondary transition-colors hover:bg-subtle"
                  >
                    {t("dashboard.signOut")}
                  </button>
                </form>
              </div>
            </div>

            <DashboardNav />
          </div>
        </header>

        <main className="flex flex-1 flex-col">{children}</main>
      </div>
    </VerticalProvider>
  );
}
