import Link from "next/link";

import { setStaffActiveAction } from "@/app/(dashboard)/dashboard/staff/actions";
import {
  DISPLAY_WEEK,
  WEEKDAY_LABELS,
} from "@/lib/availability/opening-hours";
import type { ManagedStaff } from "@/lib/db/staff";
import { initials } from "@/lib/format";

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
export function StaffList({
  staff,
  confirmingId,
}: {
  staff: ManagedStaff[];
  confirmingId: string | undefined;
}) {
  const active = staff.filter((member) => member.active);
  const retired = staff.filter((member) => !member.active);

  return (
    <div className="flex flex-col gap-8">
      <Section
        title="Working here"
        empty="No barbers yet — add the first one above."
        staff={active}
        confirmingId={confirmingId}
      />

      {retired.length > 0 ? (
        <Section
          title="No longer working here"
          hint="Not offered to customers. Their past and future appointments are untouched."
          staff={retired}
          confirmingId={confirmingId}
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
}: {
  title: string;
  hint?: string;
  empty?: string;
  staff: ManagedStaff[];
  confirmingId: string | undefined;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h2 className="text-sm font-semibold tracking-tight text-zinc-900">
          {title}
        </h2>
        {hint ? <p className="text-sm text-zinc-500">{hint}</p> : null}
      </div>

      {staff.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-zinc-300 px-4 py-6 text-center text-sm text-zinc-500">
          {empty}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {staff.map((member) => (
            <li
              key={member.id}
              className="rounded-2xl border border-zinc-200 bg-white p-4"
            >
              <StaffRow member={member} />
              {member.id === confirmingId && member.active ? (
                <DeactivateConfirmation member={member} />
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function StaffRow({ member }: { member: ManagedStaff }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
      <div className="flex min-w-0 items-center gap-3">
        <span
          aria-hidden
          className={[
            "flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-medium",
            member.active
              ? "bg-zinc-900 text-white"
              : "bg-zinc-100 text-zinc-400",
          ].join(" ")}
        >
          {initials(member.name)}
        </span>

        <div className="flex min-w-0 flex-col gap-0.5">
          <span
            className={[
              "font-medium",
              member.active ? "text-zinc-900" : "text-zinc-500",
            ].join(" ")}
          >
            {member.name}
          </span>
          <span className="text-sm text-zinc-500">
            {summariseWeek(member)}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Link
          href={`/dashboard/staff/${member.id}`}
          className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100"
        >
          Edit
        </Link>

        {member.active ? (
          // A link, not a submit: deactivating strands upcoming appointments in
          // a barber's name, so it asks first. The confirmation renders below.
          <Link
            href={`/dashboard/staff?deactivate=${member.id}`}
            scroll={false}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100"
          >
            Remove
          </Link>
        ) : (
          <form action={setStaffActiveAction}>
            <input type="hidden" name="staffId" value={member.id} />
            <input type="hidden" name="active" value="true" />
            <button
              type="submit"
              className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100"
            >
              Bring back
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
function DeactivateConfirmation({ member }: { member: ManagedStaff }) {
  const { upcomingBookings } = member;

  return (
    <div className="mt-4 flex flex-col gap-3 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
      <p>
        Remove {member.name} from the booking page?{" "}
        {upcomingBookings === 0
          ? "They have no appointments ahead of them."
          : `Their ${upcomingBookings === 1 ? "1 upcoming appointment stays" : `${upcomingBookings} upcoming appointments stay`} on the calendar — you'll need to move or cancel ${upcomingBookings === 1 ? "it" : "them"} yourself.`}{" "}
        Their hours are kept, so you can bring them back later.
      </p>

      <div className="flex items-center gap-3">
        <form action={setStaffActiveAction}>
          <input type="hidden" name="staffId" value={member.id} />
          <input type="hidden" name="active" value="false" />
          <button
            type="submit"
            className="rounded-lg bg-amber-900 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-amber-800"
          >
            Remove {member.name}
          </button>
        </form>

        <Link
          href="/dashboard/staff"
          scroll={false}
          className="text-sm text-amber-900 underline-offset-4 hover:underline"
        >
          Keep them
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
 * Abbreviated from the shared WEEKDAY_LABELS rather than a second list of names,
 * so this can't drift from the editor's ordering.
 */
function summariseWeek(member: ManagedStaff): string {
  const worked = new Set(member.workingHours.map((row) => row.dayOfWeek));

  if (worked.size === 0) {
    return member.active
      ? "No hours set — not bookable yet"
      : "No hours set";
  }

  return DISPLAY_WEEK.filter((day) => worked.has(day))
    .map((day) => WEEKDAY_LABELS[day].slice(0, 3))
    .join(", ");
}
