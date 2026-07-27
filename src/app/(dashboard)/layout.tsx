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
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-4 sm:px-6">
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
