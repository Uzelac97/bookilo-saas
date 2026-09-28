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
          {/* NO max-width, deliberately, and this is the Day 13 resolution of the
              header-inset question carried over from Day 10.

              This was max-w-5xl, which lined the shop name and nav up with the
              content column on four of the five dashboard pages. The calendar is
              the fifth: it sizes itself to its own column count and runs far
              past max-w-5xl, so on a wide monitor the grid visibly overhung the
              bar above it and the alignment read as broken rather than absent.

              Two ways to keep the alignment, both rejected. Widening the header to
              the calendar's width breaks it on the other four pages instead.
              Widening all five pages to match puts settings forms and the services
              list on a calendar-width line, which is worse to read than any
              misalignment.

              So the alignment is abandoned on purpose: the header is now app
              chrome that spans the viewport and lines up with nothing, which is
              true at every width on every page — a rule, instead of a coincidence
              that only held below 64rem. The five page wrappers keep their own
              max-w-5xl and are untouched.

              The cost, stated: on an ultrawide monitor the shop name and Sign out
              sit at opposite edges of the screen. */}
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
