import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { StaffForm } from "@/components/dashboard/staff-form";
import { WorkingHoursEditor } from "@/components/dashboard/working-hours-editor";
import { getCurrentTenant } from "@/lib/auth/session";
import { getStaffMember } from "@/lib/db/staff";

type PageProps = { params: Promise<{ staffId: string }> };

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { staffId } = await params;
  const tenant = await getCurrentTenant();
  const member = await getStaffMember(tenant.id, staffId, new Date());

  return { title: member ? member.name : "Barber not found" };
}

/**
 * One barber: their name and photo, and the hours they work.
 *
 * Two separate forms rather than one. They save independently because they fail
 * independently — a typo'd photo link shouldn't hold a week of hours hostage —
 * and because the hours editor posts a JSON payload that has nothing to do with
 * the name field.
 *
 * getStaffMember is scoped by the session's tenant, so an id belonging to
 * another shop is indistinguishable from one that doesn't exist: both 404. That
 * is the intended answer — telling the two apart is exactly what a probing
 * request wants to learn.
 */
export default async function StaffMemberPage({ params }: PageProps) {
  const { staffId } = await params;
  const tenant = await getCurrentTenant();
  const member = await getStaffMember(tenant.id, staffId, new Date());

  if (!member) notFound();

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-2">
        <Link
          href="/dashboard/staff"
          className="w-fit text-sm text-zinc-500 underline-offset-4 hover:text-zinc-900 hover:underline"
        >
          ← All staff
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
            {member.name}
          </h1>
          {!member.active ? (
            <span className="rounded-md bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600">
              No longer working here
            </span>
          ) : null}
        </div>
        {member.upcomingBookings > 0 ? (
          <p className="text-sm text-zinc-500">
            {member.upcomingBookings === 1
              ? "1 appointment ahead"
              : `${member.upcomingBookings} appointments ahead`}
          </p>
        ) : null}
      </header>

      <section className="flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-4 sm:p-6">
        <h2 className="text-sm font-semibold tracking-tight text-zinc-900">
          Details
        </h2>
        <StaffForm member={member} />
      </section>

      <section className="flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-4 sm:p-6">
        <div className="flex flex-col gap-1">
          <h2 className="text-sm font-semibold tracking-tight text-zinc-900">
            Working hours
          </h2>
          <p className="text-sm text-zinc-500">
            {/* Said here because it's the surprising part of a model with no
                business-level hours field: this is not just when one barber is
                free, it is what the shop tells customers it's open. */}
            These decide when customers can book {member.name}, and together with
            your other barbers&rsquo; hours they are the opening hours shown on
            your public page. Add a second interval to a day for a lunch break.
          </p>
        </div>
        <WorkingHoursEditor
          staffId={member.id}
          workingHours={member.workingHours}
        />
      </section>
    </div>
  );
}
