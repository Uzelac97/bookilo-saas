import Link from "next/link";

import { setStaffActiveAction } from "@/app/(dashboard)/dashboard/staff/actions";
import { DISPLAY_WEEK } from "@/lib/availability/opening-hours";
import type { ManagedStaff } from "@/lib/db/staff";
import { initials } from "@/lib/format";
import { getT } from "@/lib/i18n/server";
import type { Translator } from "@/lib/i18n/translate";
import { weekdayName } from "@/lib/i18n/weekdays";

/**
 * The owner's barbers, active and retired.
 *
 * Retired barbers are listed for the same reason retired services are: there is
 * no hard-delete for Staff (CLAUDE.md), so it's a state reachable by accident,
 * and hiding those rows would leave no way back.
 *
 * Deactivation confirms first, through `?deactivate=<id>` in the URL rather than
 * a dialog or a window.confirm — it keeps this a server component, survives a
 * refresh, and lets the confirmation state the one fact that decides it: how
 * many appointments the person still has ahead of them.
 */
export async function StaffList({
  staff,
  confirmingId,
}: {
  staff: ManagedStaff[];
  confirmingId: string | undefined;
}) {
  const active = staff.filter((member) => member.active);
  const retired = staff.filter((member) => !member.active);
  const t = await getT();

  return (
    <div className="flex flex-col gap-8">
      <Section
        title={t("staff.active")}
        empty={t("staff.activeEmpty")}
        staff={active}
        confirmingId={confirmingId}
        t={t}
      />

      {retired.length > 0 ? (
        <Section
          title={t("staff.inactiveBadge")}
          hint={t("staff.inactiveHint")}
          staff={retired}
          confirmingId={confirmingId}
          t={t}
        />
      ) : null}
    </div>
  );
}

function Section({
  title,
  hint,
  empty,
  staff,
  confirmingId,
  t,
}: {
  title: string;
  hint?: string;
  empty?: string;
  staff: ManagedStaff[];
  confirmingId: string | undefined;
  t: Translator;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h2 className="text-sm font-semibold tracking-tight text-fg">
          {title}
        </h2>
        {hint ? <p className="text-sm text-fg-muted">{hint}</p> : null}
      </div>

      {staff.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line-strong px-4 py-6 text-center text-sm text-fg-muted">
          {empty}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {staff.map((member) => (
            <li
              key={member.id}
              className="rounded-2xl border border-line bg-surface p-4"
            >
              <StaffRow member={member} t={t} />
              {member.id === confirmingId && member.active ? (
                <DeactivateConfirmation member={member} t={t} />
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function StaffRow({ member, t }: { member: ManagedStaff; t: Translator }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
      <div className="flex min-w-0 items-center gap-3">
        <span
          aria-hidden
          className={[
            "flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-medium",
            member.active
              ? "bg-primary text-on-primary"
              : "bg-subtle text-fg-faint",
          ].join(" ")}
        >
          {initials(member.name)}
        </span>

        <div className="flex min-w-0 flex-col gap-0.5">
          <span
            className={[
              "font-medium",
              member.active ? "text-fg" : "text-fg-muted",
            ].join(" ")}
          >
            {member.name}
          </span>
          <span className="text-sm text-fg-muted">
            {summariseWeek(member, t)}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Link
          href={`/dashboard/staff/${member.id}`}
          className="rounded-lg border border-line-strong bg-surface px-3 py-1.5 text-sm font-medium text-fg-secondary transition-colors hover:bg-subtle"
        >
          {t("common.edit")}
        </Link>

        {member.active ? (
          // A link, not a submit: deactivating strands upcoming appointments in
          // a barber's name, so it asks first. The confirmation renders below.
          <Link
            href={`/dashboard/staff?deactivate=${member.id}`}
            scroll={false}
            className="rounded-lg border border-line-strong bg-surface px-3 py-1.5 text-sm font-medium text-fg-secondary transition-colors hover:bg-subtle"
          >
            {t("staff.remove")}
          </Link>
        ) : (
          <form action={setStaffActiveAction}>
            <input type="hidden" name="staffId" value={member.id} />
            <input type="hidden" name="active" value="true" />
            <button
              type="submit"
              className="rounded-lg border border-line-strong bg-surface px-3 py-1.5 text-sm font-medium text-fg-secondary transition-colors hover:bg-subtle"
            >
              {t("staff.bringBack")}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

/**
 * The inline "are you sure", stating what actually happens.
 *
 * The upcoming count is the whole point of asking. Deactivating is safe — the
 * bookings survive and keep their column on the calendar — but "safe" isn't what
 * it feels like without the number, and the alternative is an owner who avoids
 * the button and keeps a barber who left in the picker.
 */
function DeactivateConfirmation({
  member,
  t,
}: {
  member: ManagedStaff;
  t: Translator;
}) {
  const { upcomingBookings } = member;

  return (
    <div className="mt-4 flex flex-col gap-3 rounded-xl bg-warning-soft p-4 text-sm text-warning">
      <p>
        {t("staff.removeQuestion", { name: member.name })}{" "}
        {upcomingBookings === 0
          ? t("staff.removeNoUpcoming")
          : t("staff.removeUpcoming", { count: upcomingBookings })}{" "}
        {t("staff.removeHoursKept")}
      </p>

      <div className="flex items-center gap-3">
        <form action={setStaffActiveAction}>
          <input type="hidden" name="staffId" value={member.id} />
          <input type="hidden" name="active" value="false" />
          <button
            type="submit"
            className="rounded-lg bg-warning-solid px-3 py-1.5 text-sm font-medium text-on-warning transition-colors hover:bg-warning-solid-hover"
          >
            {t("staff.removeConfirm", { name: member.name })}
          </button>
        </form>

        <Link
          href="/dashboard/staff"
          scroll={false}
          className="text-sm text-warning underline-offset-4 hover:underline"
        >
          {t("staff.keep")}
        </Link>
      </div>
    </div>
  );
}

/**
 * "Mon, Tue, Wed, Thu, Fri" — which days this barber works at all.
 *
 * Days rather than times, because a barber with a split shift or different hours
 * per day can't be summarised in one line without either lying or running long.
 * The exact intervals are one click away on their own screen, which is where
 * they're edited anyway.
 *
 * Ordered by the shared DISPLAY_WEEK, so this can't drift from the editor's
 * ordering, and named through weekdayName() in the interface language.
 */
function summariseWeek(member: ManagedStaff, t: Translator): string {
  const worked = new Set(member.workingHours.map((row) => row.dayOfWeek));

  if (worked.size === 0) {
    return member.active ? t("staff.noHoursBookable") : t("staff.noHours");
  }

  return DISPLAY_WEEK.filter((day) => worked.has(day))
    .map((day) => weekdayName(t, day, "short"))
    .join(", ");
}
