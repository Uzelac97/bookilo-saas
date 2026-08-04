import Link from "next/link";

import { DashboardNav } from "@/components/dashboard/dashboard-nav";
import { getCurrentTenant, requireSession } from "@/lib/auth/session";

import { signOutAction } from "./actions";

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

  return (
    <div className="flex flex-1 flex-col bg-zinc-50">
      <header className="border-b border-zinc-200 bg-white">
        {/* NO max-width, deliberately, and this is the Day 13 resolution of the
            header-inset question carried over from Day 10.

            This was max-w-5xl, which lined the shop name and nav up with the
            content column on four of the five dashboard pages. The calendar is
            the fifth: it sizes itself to its own column count and runs out to
            max-w-[120rem], so on a wide monitor the grid visibly overhung the
            bar above it and the alignment read as broken rather than absent.

            Two ways to keep the alignment, both rejected. Widening the header to
            the calendar's width breaks it on the other four pages instead.
            Widening all five pages to match puts settings forms and the services
            list on a 120rem line, which is worse to read than any misalignment.

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
              <span className="text-base font-semibold tracking-tight text-zinc-900">
                {tenant.name}
              </span>
              <Link
                href={`/b/${tenant.slug}`}
                className="w-fit text-sm text-zinc-500 underline-offset-4 hover:text-zinc-900 hover:underline"
              >
                View public page
              </Link>
            </div>

            <form action={signOutAction}>
              <button
                type="submit"
                className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100"
              >
                Sign out
              </button>
            </form>
          </div>

          <DashboardNav />
        </div>
      </header>

      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  );
}
