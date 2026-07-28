import type { Metadata } from "next";

import {
  calendarCardWidth,
  CalendarGrid,
} from "@/components/dashboard/calendar-grid";
import { CalendarNav } from "@/components/dashboard/calendar-nav";
import { WeekAgenda } from "@/components/dashboard/week-agenda";
import { getCurrentTenant } from "@/lib/auth/session";
import {
  buildDayGrid,
  buildWeekGrid,
  groupByLocalDate,
  weekdaysOf,
} from "@/lib/dashboard/calendar-layout";
import { staffColorMap } from "@/lib/dashboard/staff-colors";
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
 * The three lengths bounding the calendar column, all border-box.
 *
 * PAGE_GUTTER is this page's own `sm:px-6`, both sides. It has to be added back
 * because the container's max-width includes its padding, so sizing to the
 * card's width alone would leave the card 3rem too wide for its own parent and
 * push it into a scroll.
 *
 * MIN is a floor on how narrow the whole column may get. Without it a two-barber
 * day collapses the page to ~626px, which stops reading as compact and starts
 * reading as broken. MAX is the widest the grid can reach — a 4rem axis plus
 * seven columns at their cap — past which a larger container would only stretch
 * the header row, pushing the view toggle away from the heading it belongs to.
 *
 * The base breakpoint's `px-4` is 1rem narrower than PAGE_GUTTER, so below `sm`
 * this over-allocates by 1rem. That never binds: MIN alone is already wider than
 * any viewport small enough for the difference to matter.
 */
const PAGE_GUTTER = "3rem";
const MIN_PAGE_WIDTH = "64rem";
const MAX_PAGE_WIDTH = "120rem";

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

  // Built from getStaffForCalendar's ordering, which includes inactive barbers —
  // that is what keeps a colour from shifting the day someone is deactivated.
  const staffColors = staffColorMap(staff);
  const today = todayInZone(now, tenant.timezone);
  // Grouped once here rather than inside the agenda, so the only place a UTC
  // instant becomes a tenant-local day stays lib/dashboard/calendar-layout.
  const bookingsByDate = groupByLocalDate(bookings, tenant.timezone);

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
    // Sized to the grid rather than to the viewport, then centred.
    //
    // A fixed wide cap left a two-barber day as a 576px card at the left edge of
    // a 1920px container, with the nav row's controls stretched to either end of
    // a width the grid never used — the card and the buttons meant to drive it
    // stopped looking like one object. Deriving the width from the column count
    // keeps the header, the controls and the grid the same width at every staff
    // count, and `mx-auto` centres the result.
    //
    // clamp rather than a plain max-width because both ends are real: the floor
    // stops a two-barber day collapsing to something that reads as broken, and
    // the ceiling stops an ultrawide monitor stretching the header past the
    // widest grid that can exist.
    <div
      style={{
        maxWidth: `clamp(${MIN_PAGE_WIDTH}, calc(${calendarCardWidth(grid.columns.length)} + ${PAGE_GUTTER}), ${MAX_PAGE_WIDTH})`,
      }}
      className="mx-auto flex w-full flex-col gap-6 px-4 py-8 sm:px-6"
    >
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
        todayDate={today}
        atToday={rangeContainsToday(range, now, tenant.timezone)}
      >
        {view === "week" ? (
          // The grid needs 1072px before it starts scrolling — nearly three
          // screens on a phone. Below md the week becomes a vertical agenda
          // instead. Both are server-rendered and one is hidden with CSS: for a
          // small shop's week that is a few dozen extra list items, far cheaper
          // than moving the choice to the client and needing the viewport.
          <>
            <div className="hidden md:block">
              <CalendarGrid
                grid={grid}
                timezone={tenant.timezone}
                staffColors={staffColors}
                showBarber
              />
            </div>
            <div className="md:hidden">
              <WeekAgenda
                days={dates.map((day) => ({
                  date: day,
                  bookings: bookingsByDate.get(day) ?? [],
                }))}
                timezone={tenant.timezone}
                todayDate={today}
                now={now}
              />
            </div>
          </>
        ) : (
          // The day view stays the grid at every width. Its column count is the
          // shop's barbers rather than a fixed seven, so it fits a phone at the
          // one-to-three chairs this product is aimed at. See the Day 13 note in
          // EXECUTION-PLAN.md for where that stops being true.
          <CalendarGrid
            grid={grid}
            timezone={tenant.timezone}
            staffColors={staffColors}
            showBarber={false}
          />
        )}
      </CalendarNav>
    </div>
  );
}
