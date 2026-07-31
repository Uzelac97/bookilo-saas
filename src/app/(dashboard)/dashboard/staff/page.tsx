import type { Metadata } from "next";

import { StaffForm } from "@/components/dashboard/staff-form";
import { StaffList } from "@/components/dashboard/staff-list";
import { getCurrentTenant } from "@/lib/auth/session";
import { getStaffForManagement } from "@/lib/db/staff";

export const metadata: Metadata = {
  title: "Staff",
};

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** searchParams values are `string | string[]`; a repeated key takes the first. */
function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * The shop's barbers.
 *
 * Opening hours live here, per staff member, and not on the settings screen:
 * there is no business-level hours field by design (EXECUTION-PLAN.md), so what
 * the public page calls "opening hours" is the union of these. Each barber's
 * intervals are edited on their own screen; this one lists who exists.
 *
 * The tenant comes from the session (CLAUDE.md rule 2), and the only client-side
 * state is `?deactivate=<id>` in the URL.
 */
export default async function StaffPage({ searchParams }: PageProps) {
  const tenant = await getCurrentTenant();
  const query = await searchParams;
  const staff = await getStaffForManagement(tenant.id, new Date());

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
          Staff
        </h1>
        <p className="text-sm text-zinc-500">
          Your barbers and the hours each of them works. Any active barber can
          perform any active service.
        </p>
      </header>

      <section className="flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-4 sm:p-6">
        <h2 className="text-sm font-semibold tracking-tight text-zinc-900">
          Add a barber
        </h2>
        <StaffForm />
      </section>

      <StaffList staff={staff} confirmingId={first(query.deactivate)} />
    </div>
  );
}
