import { requireSession } from "@/lib/auth/session";

/**
 * Auth guard for every dashboard route. proxy.ts already redirects
 * unauthenticated requests, but that can be bypassed by a mistake in the
 * matcher — this makes the guard structural rather than configuration-shaped.
 *
 * The real nav/shell lands on Day 9.
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireSession();

  return <div className="flex flex-1 flex-col bg-zinc-50">{children}</div>;
}
