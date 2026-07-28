import type { Metadata } from "next";

import { CalendarGrid } from "@/components/dashboard/calendar-grid";
import { CalendarNav } from "@/components/dashboard/calendar-nav";
import { getCurrentTenant } from "@/lib/auth/session";
import {
  buildDayGrid,
  buildWeekGrid,
  weekdaysOf,
} from "@/lib/dashboard/calendar-layout";
import {
  calendarRange,
  rangeContainsToday,
  resolveCalendarDate,
  resolveCalendarView,
  shiftCalendarDate,
  todayInZone,
  weekDays,
} from "@/lib/dashboard/calendar-range";
import { getBookingsForRange } from "@/lib/db/bookings";
import { getStaffForCalendar, getWorkingHoursForActiveStaff } from "@/lib/db/staff";
import { formatBookingDate, formatDateRange } from "@/lib/format";

export const metadata: Metadata = {
  title: "Calendar",
};

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** searchParams values are `string | string[]`; a repeated key takes the first. */
function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * The owner's calendar: a day grid with one column per barber, or a week grid
 * with one column per day.
 *
 * The tenant comes from the session and nothing else — the slug in the URL is
 * the *public* resolution path and the two never mix (EXECUTION-PLAN.md §3).
 *
 * The URL carries `date` and `view`, and that's the whole of the client-side
 * state, exactly as components/booking/booking-flow.tsx sets out: both change
 * what the server has to fetch, so a change to either is a navigation and this
 * component recomputes from the database. Nothing here is client-fetched.
 *
 * Note which date helpers this uses. lib/dashboard/calendar-range.ts, NOT
 * lib/availability/booking-options.ts — the latter clamps every date into
 * [today, today + 30] because a customer can't book the past, and an owner
 * reviewing yesterday's no-shows very much can. The two modules look
 * interchangeable and aren't.
 */
export default async function CalendarPage({ searchParams }: PageProps) {
  const tenant = await getCurrentTenant();
  const query = await searchParams;
  const now = new Date();

  const view = resolveCalendarView(first(query.view));
  const date = resolveCalendarDate(first(query.date), now, tenant.timezone);
  const range = calendarRange(date, view, tenant.timezone);

  const [bookings, staff, workingHours] = await Promise.all([
    getBookingsForRange(tenant.id, { ...range, timezone: tenant.timezone }),
    getStaffForCalendar(tenant.id),
    getWorkingHoursForActiveStaff(tenant.id),
  ]);

  const dates = view === "week" ? weekDays(date, tenant.timezone) : [date];

  // Only the weekdays actually on screen shape the axis. Feeding all seven days'
  // rows into a Tuesday would stretch the grid to cover Saturday's late shift on
  // a day nobody works it.
  const onScreen = new Set(weekdaysOf(dates, tenant.timezone));
  const relevantHours = workingHours.filter((row) =>
    onScreen.has(row.dayOfWeek),
  );

  const grid =
    view === "week"
      ? buildWeekGrid({
          bookings,
          dates,
          workingHours: relevantHours,
          timezone: tenant.timezone,
          now,
        })
      : buildDayGrid({
          bookings,
          staff,
          workingHours: relevantHours,
          timezone: tenant.timezone,
        });

  return (
    // Wider than the max-w-5xl the list-and-form pages use, because this one is
    // a multi-column view whose column count scales with the shop — seven in the
    // week view regardless. The cap is the widest the grid can actually get
    // (a 4rem axis + 7 columns at MAX_COLUMN_WIDTH, plus this padding), not a
    // guess: past that point the grid stops growing and the only thing a larger
    // cap would stretch is the header row, pushing the view toggle away from the
    // heading on an ultrawide monitor.
    <div className="mx-auto flex w-full max-w-[120rem] flex-col gap-6 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
          Calendar
        </h1>
        <p className="text-sm text-zinc-500">
          {bookings.length === 1
            ? "1 appointment"
            : `${bookings.length} appointments`}{" "}
          · {tenant.timezone}
        </p>
      </header>

      {/* Every date the nav can navigate to is resolved here, server-side, and
          handed over as a finished string. The nav does no date arithmetic of
          its own — same contract as DateStrip, and the reason it can't
          accidentally reach for the clamped booking-flow helpers.

          The grid is passed as children rather than rendered as a sibling so it
          can be dimmed while the next server render is in flight: the pending
          flag lives inside the nav's useTransition and can't reach across to a
          sibling. It stays a server component either way — this is a server
          parent handing rendered children to a client one, not the grid being
          pulled into the client bundle. */}
      <CalendarNav
        view={view}
        heading={
          view === "week"
            ? formatDateRange(range.fromDate, range.toDate, tenant.timezone)
            : formatBookingDate(date, tenant.timezone)
        }
        previousDate={shiftCalendarDate(date, view, -1, tenant.timezone)}
        nextDate={shiftCalendarDate(date, view, 1, tenant.timezone)}
        todayDate={todayInZone(now, tenant.timezone)}
        atToday={rangeContainsToday(range, now, tenant.timezone)}
      >
        <CalendarGrid grid={grid} timezone={tenant.timezone} />
      </CalendarNav>
    </div>
  );
}
