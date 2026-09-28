/**
 * Which days the owner's calendar is looking at, and how the ‹ › controls move.
 *
 * PURE, `now` injected, same contract as lib/availability/booking-options.ts
 * next door — and this module exists precisely *because* that one does.
 *
 * DO NOT REUSE THE BOOKING FLOW'S DATE HELPERS HERE. resolveBookingDate,
 * dateStrip, canPageBack and canPageForward all clamp to
 * [today, today + BOOKING_HORIZON_DAYS], because a customer may not book the
 * past and may not book a year out. An owner has the opposite requirement:
 * yesterday's takings, last month's no-shows and next quarter's holiday cover
 * are all things they legitimately need to look at. Importing those helpers here
 * would type-check, look right in review, and silently pin the calendar to
 * today-or-later — a bug with no error and no failing test. Hence a second,
 * deliberately unclamped module rather than a flag on the first.
 *
 * The one helper shared with it is todayInZone, which clamps nothing — it only
 * answers what day it is at the shop, and the overview, the calendar and the
 * booking flow must all agree on that.
 */
import { DateTime } from "luxon";

import { todayInZone } from "@/lib/availability/booking-options";

/** Day view or week view. Carried in `?view=`. */
export type CalendarView = "day" | "week";

const DEFAULT_VIEW: CalendarView = "day";

/** Monday-first, matching Luxon's ISO week and every German wall calendar. */
export const DAYS_PER_WEEK = 7;

/**
 * Reads `?view=`, falling back to the day view on anything unrecognised.
 *
 * Falls back rather than throwing for the same reason resolveBookingDate clamps:
 * a stale bookmark or a hand-edited URL should land somewhere sensible, not on
 * a 500.
 */
export function resolveCalendarView(raw: string | undefined): CalendarView {
  return raw === "week" || raw === "day" ? raw : DEFAULT_VIEW;
}

/**
 * Reads `?date=`, falling back to the shop's today.
 *
 * Validates but does not clamp — see the module note. The only rejected values
 * are ones that aren't a calendar date at all. There is no upper or lower bound
 * on purpose: an owner browsing to 2019 gets an empty grid, which is the honest
 * answer, and the query behind it is bounded by the view's span (at most seven
 * days) regardless of how far away the anchor sits.
 */
export function resolveCalendarDate(
  raw: string | undefined,
  now: Date,
  timezone: string,
): string {
  const today = todayInZone(now, timezone);
  if (!raw) return today;

  const parsed = DateTime.fromISO(raw, { zone: timezone });
  if (!parsed.isValid) return today;

  return parsed.toISODate() ?? today;
}

/** The half-open span of tenant-local days a view covers, both ends inclusive. */
export type CalendarRange = { fromDate: string; toDate: string };

/**
 * The days one view covers, ready to hand to getBookingsForRange.
 *
 * The day view is a single day. The week view is the Monday–Sunday week
 * *containing* the selected date, not seven days starting from it — an owner who
 * clicks Thursday and switches to the week view expects that week, with Thursday
 * in its usual place, rather than a strip that happens to begin on Thursday.
 * (The public booking flow's dateStrip makes the opposite call, and correctly:
 * there the strip is a rolling seven days from the selection because a customer
 * cares about "soon", not about which calendar week it falls in.)
 */
export function calendarRange(
  date: string,
  view: CalendarView,
  timezone: string,
): CalendarRange {
  if (view === "day") return { fromDate: date, toDate: date };

  const days = weekDays(date, timezone);

  return { fromDate: days[0], toDate: days[days.length - 1] };
}

/**
 * The seven tenant-local days of the week containing `date`, Monday first.
 *
 * Built by calendar arithmetic rather than by adding 86_400_000 seven times: a
 * week containing a DST change is 167 or 169 hours long, and fixed-millisecond
 * stepping would repeat or skip a day inside it.
 */
export function weekDays(date: string, timezone: string): string[] {
  const anchor = parseDate(date, timezone, "weekDays");
  const monday = anchor.startOf("week");

  const days: string[] = [];

  for (let offset = 0; offset < DAYS_PER_WEEK; offset += 1) {
    const day = monday.plus({ days: offset }).toISODate();
    // toISODate() only returns null for an invalid DateTime, and `anchor` is
    // already validated — but the type is nullable, so this is not a cast.
    if (day) days.push(day);
  }

  return days;
}

/**
 * Moves the selection one step in the current view's units: a day in the day
 * view, a whole week in the week view.
 *
 * Stepping by a week in the week view rather than by seven days means the
 * selection keeps its weekday, so paging forward from Thursday lands on
 * Thursday and the grid doesn't slide sideways under the owner.
 */
export function shiftCalendarDate(
  date: string,
  view: CalendarView,
  steps: number,
  timezone: string,
): string {
  const anchor = parseDate(date, timezone, "shiftCalendarDate");
  const shifted =
    view === "week"
      ? anchor.plus({ weeks: steps })
      : anchor.plus({ days: steps });

  return shifted.toISODate() ?? date;
}

/**
 * Whether the current view already contains the shop's today — what the "Today"
 * button disables on.
 *
 * Asks about the *range*, not the selected date, so in the week view the button
 * is correctly dead for the whole of this week rather than only on today itself.
 */
export function rangeContainsToday(
  range: CalendarRange,
  now: Date,
  timezone: string,
): boolean {
  const today = todayInZone(now, timezone);

  // ISO dates are zero-padded and fixed-width, so lexical comparison is date
  // comparison. Same shortcut booking-options.ts takes.
  return range.fromDate <= today && today <= range.toDate;
}

function parseDate(date: string, timezone: string, caller: string): DateTime {
  const parsed = DateTime.fromISO(date, { zone: timezone });

  if (!parsed.isValid) {
    throw new Error(
      `${caller}: invalid date "${date}" for timezone "${timezone}"`,
    );
  }

  return parsed;
}
