import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { StaffForm } from "@/components/dashboard/staff-form";
import { TimeOffEditor } from "@/components/dashboard/time-off-editor";
import { WorkingHoursEditor } from "@/components/dashboard/working-hours-editor";
import { getCurrentTenant } from "@/lib/auth/session";
import { getStaffMember } from "@/lib/db/staff";
import { getT } from "@/lib/i18n/server";

type PageProps = { params: Promise<{ staffId: string }> };

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { staffId } = await params;
  const tenant = await getCurrentTenant();
  const member = await getStaffMember(tenant.id, staffId, new Date());
  const t = await getT();

  return { title: member ? member.name : t("staff.notFound") };
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

  const t = await getT();

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-2">
        <Link
          href="/dashboard/staff"
          className="w-fit text-sm text-fg-muted underline-offset-4 hover:text-fg hover:underline"
        >
          ← {t("staff.backToAll")}
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-fg">
            {member.name}
          </h1>
          {!member.active ? (
            <span className="rounded-md bg-subtle px-2 py-0.5 text-xs font-medium text-fg-tertiary">
              {t("staff.inactiveBadge")}
            </span>
          ) : null}
        </div>
        {member.upcomingBookings > 0 ? (
          <p className="text-sm text-fg-muted">
            {t("staff.upcoming", { count: member.upcomingBookings })}
          </p>
        ) : null}
      </header>

      <section className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-4 sm:p-6">
        <h2 className="text-sm font-semibold tracking-tight text-fg">
          {t("staff.details")}
        </h2>
        <StaffForm member={member} />
      </section>

      <section className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-4 sm:p-6">
        <div className="flex flex-col gap-1">
          <h2 className="text-sm font-semibold tracking-tight text-fg">
            {t("staff.workingHours")}
          </h2>
          <p className="text-sm text-fg-muted">
            {/* Said here because it's the surprising part of a model with no
                business-level hours field: this is not just when one barber is
                free, it is what the shop tells customers it's open. */}
            {t("staff.workingHoursIntro", { name: member.name })}
          </p>
        </div>
        <WorkingHoursEditor
          staffId={member.id}
          workingHours={member.workingHours}
        />
      </section>

      <section className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-4 sm:p-6">
        <div className="flex flex-col gap-1">
          <h2 className="text-sm font-semibold tracking-tight text-fg">
            {t("staff.timeOff")}
          </h2>
          <p className="text-sm text-fg-muted">
            {t("staff.timeOffIntro", { name: member.name })}
          </p>
          {/* Both stated here rather than discovered. The first is the same
              shape as the buffer note on the settings screen — a change that
              deliberately doesn't reach backwards — and the second is a gap an
              owner would otherwise read as the save having failed. */}
          <p className="text-sm text-fg-muted">
            {t("staff.timeOffNote")}
          </p>
        </div>
        <TimeOffEditor
          staffId={member.id}
          staffName={member.name}
          timeOff={member.timeOff}
          timezone={tenant.timezone}
        />
      </section>
    </div>
  );
}
