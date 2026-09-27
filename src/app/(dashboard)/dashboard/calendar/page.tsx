import type { Metadata } from "next";
import Link from "next/link";
import type { CSSProperties } from "react";

import { CalendarGrid } from "@/components/dashboard/calendar-grid";
import { CalendarNav } from "@/components/dashboard/calendar-nav";
import {
  CALENDAR_ASIDE_GAP,
  CALENDAR_ASIDE_WIDTH,
  CalendarSummary,
} from "@/components/dashboard/calendar-summary";
import { WeekAgenda } from "@/components/dashboard/week-agenda";
import { getCurrentTenant } from "@/lib/auth/session";
import {
  buildDayGrid,
  buildWeekGrid,
  groupByLocalDate,
  weekdaysOf,
} from "@/lib/dashboard/calendar-layout";
import { calendarCardWidth } from "@/lib/dashboard/calendar-metrics";
import { staffColorMap } from "@/lib/dashboard/staff-colors";
import { summariseDay } from "@/lib/dashboard/today-summary";
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
import {
  formatBookingDate,
  formatDateRange,
  formatMinuteOfDay,
} from "@/lib/format";
import { getDashboardT } from "@/lib/i18n/server";
import { getLocale } from "@/lib/preferences-server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDashboardT();
  return { title: t("nav.calendar") };
}

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
 * The ceiling when the sidebar is showing — the widest grid plus the sidebar
 * beside it. Without raising it, a seven-column week and an 18rem aside would
 * total ~139rem, hit the 120rem cap, and push the grid into a scroll on a
 * monitor wide enough to have shown both.
 */
const MAX_PAGE_WIDTH_WITH_ASIDE = "140rem";

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
  const [tenant, t, locale] = await Promise.all([
    getCurrentTenant(),
    getDashboardT(),
    getLocale(),
  ]);
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

  // The same three figures the overview shows, over whatever range is on screen
  // rather than over today — the sidebar's whole reason for existing is that the
  // calendar is usually not showing today.
  const summary = summariseDay(bookings, now);

  // THE GRID SHOWS OCCUPIED TIME, so a cancellation does not belong in it: the
  // slot has been released and is bookable again, and drawing a block there says
  // the opposite. The struck-through style it would get reads as "this happened
  // and is void" rather than "this hour is free", which is the wrong answer to
  // the only question a calendar grid is asked.
  //
  // Filtered here rather than inside the builders on purpose. getBookingsForRange
  // deliberately applies no status filter and leaves the choice to its caller,
  // and the choice genuinely differs per surface: the mobile agenda below is a
  // list, not a grid, so it keeps cancellations for the same reason the Today
  // overview does — an owner needs to see the booking that fell through.
  //
  // NO_SHOW stays in. That appointment did occupy the chair; nobody turned up,
  // which is a different fact and one the block's amber styling already carries.
  const occupying = bookings.filter((booking) => booking.status !== "CANCELLED");
  const cancelledCount = bookings.length - occupying.length;

  // Clicking empty space in the grid opens the manual booking form with the
  // barber, day and time already chosen. The two views need different links
  // because a column means different things in each — a staff id in the day
  // view, an ISO date in the week view — and CalendarGrid deliberately doesn't
  // know which, so it takes a builder rather than guessing from the key.
  const slotHref =
    view === "week"
      ? (columnKey: string, minute: number) =>
          `/dashboard/bookings/new?date=${columnKey}&time=${formatMinuteOfDay(minute)}`
      : (columnKey: string, minute: number) =>
          `/dashboard/bookings/new?date=${date}&staffId=${columnKey}&time=${formatMinuteOfDay(minute)}`;

  const grid =
    view === "week"
      ? buildWeekGrid({
          bookings: occupying,
          dates,
          workingHours: relevantHours,
          timezone: tenant.timezone,
          locale,
          now,
        })
      : buildDayGrid({
          bookings: occupying,
          staff,
          workingHours: relevantHours,
          timezone: tenant.timezone,
          locale,
          vertical: tenant.businessType,
        });

  // Two container widths, one per breakpoint — see the note on the wrapper.
  // The week view keeps the narrow value in both slots: its grid already fills
  // a 1920px screen, so giving it a sidebar would buy 18rem of figures at the
  // cost of pushing the seven columns into a horizontal scroll.
  const cardWidth = calendarCardWidth(grid.columns.length);
  const narrowWidth = `clamp(${MIN_PAGE_WIDTH}, calc(${cardWidth} + ${PAGE_GUTTER}), ${MAX_PAGE_WIDTH})`;
  const wideWidth =
    view === "week"
      ? narrowWidth
      : `clamp(${MIN_PAGE_WIDTH}, calc(${cardWidth} + ${CALENDAR_ASIDE_WIDTH} + ${CALENDAR_ASIDE_GAP} + ${PAGE_GUTTER}), ${MAX_PAGE_WIDTH_WITH_ASIDE})`;

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
    //
    // Two widths rather than one because the sidebar only appears at 2xl, and a
    // max-width can't carry a media query inline. Both are published as custom
    // properties and the breakpoint picks between them in the class list, so the
    // container is sized to what is actually beside the grid at that width
    // rather than to the widest case at every width.
    <div
      style={
        {
          "--cal-w": narrowWidth,
          "--cal-w-aside": wideWidth,
        } as CSSProperties
      }
      className="mx-auto flex w-full max-w-(--cal-w) flex-col gap-6 px-4 py-8 sm:px-6 2xl:max-w-(--cal-w-aside)"
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight text-fg">
            {t("nav.calendar")}
          </h1>
          {/* Counts what the grid draws and what the sidebar totals — one
              definition of "appointment" across all three, or the page
              contradicts itself in two places at once. Cancellations are still
              reported, as a separate figure that says what it is rather than
              being folded into a number that then disagrees with the sidebar's. */}
          <p className="text-sm text-fg-muted">
            {occupying.length === 0
              ? t("calendar.noAppointments")
              : t("calendar.appointmentCount", { count: occupying.length })}
            {cancelledCount > 0
              ? ` · ${t("calendar.cancelledCount", { count: cancelledCount })}`
              : ""}{" "}
            · {tenant.timezone}
          </p>
        </div>

        {/* The guaranteed way in. Clicking empty grid space does the same thing
            with more prefilled, but that is a shortcut to discover rather than
            the only route — and it doesn't exist at all on the mobile agenda. */}
        <Link
          href={`/dashboard/bookings/new?date=${date}`}
          className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-on-primary transition-colors hover:bg-primary-hover"
        >
          {t("dashboard.newBooking")}
        </Link>
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
            ? formatDateRange(
                range.fromDate,
                range.toDate,
                tenant.timezone,
                locale,
              )
            : formatBookingDate(date, tenant.timezone, locale)
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
                slotHref={slotHref}
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
          //
          // From 2xl up it gains the summary beside it. That is where the space
          // exists — a two-barber day is 578px of grid, so on anything wider
          // than about 1536px the alternative is empty page. The pair is
          // centred as a unit rather than the grid alone, or the sidebar would
          // push the grid off-centre by half its own width.
          <div className="mx-auto flex w-fit max-w-full flex-col gap-6 2xl:flex-row 2xl:items-start">
            <CalendarGrid
              grid={grid}
              timezone={tenant.timezone}
              staffColors={staffColors}
              showBarber={false}
              slotHref={slotHref}
            />

            <aside
              style={{ width: CALENDAR_ASIDE_WIDTH }}
              className="hidden shrink-0 2xl:block"
            >
              <CalendarSummary summary={summary} timezone={tenant.timezone} />
            </aside>
          </div>
        )}
      </CalendarNav>
    </div>
  );
}
