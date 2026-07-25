import type { Metadata } from "next";

import { signOut } from "@/lib/auth/auth";
import { getCurrentTenant, requireSession } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Dashboard",
};

// Placeholder so route protection is testable end to end today. The real
// overview (today's bookings, pulled through lib/db/bookings.ts) is Day 9.
export default async function DashboardPage() {
  const { role } = await requireSession();
  const tenant = await getCurrentTenant();

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
        {tenant.name}
      </h1>
      <p className="mt-1 text-sm text-zinc-500">
        Signed in as {role.toLowerCase()} · {tenant.timezone} ·{" "}
        <span className="font-mono">/b/{tenant.slug}</span>
      </p>

      <form
        action={async () => {
          "use server";
          await signOut({ redirectTo: "/login" });
        }}
      >
        <button
          type="submit"
          className="mt-8 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100"
        >
          Sign out
        </button>
      </form>
    </div>
  );
}
