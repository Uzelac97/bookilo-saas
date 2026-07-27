/**
 * Turning a list of bookings into the geometry the calendar grid renders.
 *
 * PURE, like lib/availability/* and ./today-summary.ts. No I/O, no `new Date()`,
 * `now` injected where it's needed. Everything the components receive is already
 * a number — the grid does no date math of its own, the same way
 * components/booking/date-strip.tsx does none.
 *
 * THE RULE THIS MODULE EXISTS TO HOLD: a booking's vertical position comes from
 * its *tenant-local wall clock*, never from elapsed time since the start of the
 * day. Those two agree on 363 days a year and disagree on the other two. On the
 * 25-hour day Berlin's clocks go back, a 14:00 appointment is fifteen elapsed
 * hours after local midnight, so `(startAt - dayStart) / 60000` would draw it on
 * the 15:00 row — the whole afternoon silently shifted by an hour, twice a year,
 * with nothing to catch it but a customer standing in the shop at the wrong
 * time. Hence localMinutes() below, and hence this file is unit tested.
 *
 * The axis itself is wall clock too, which has a known and accepted consequence:
 * on that same 25-hour day the 02:00–03:00 hour happens twice and the grid shows
 * it once, so two bookings an hour apart in real time would overlap on the same
 * row. Not worth solving — it needs a shop open at 2:30am to be observable.
 */
import { DateTime } from "luxon";

import type { WorkingHoursRow } from "@/lib/availability/slots";
import type { DashboardBooking } from "@/lib/db/bookings";
import type { CalendarStaff } from "@/lib/db/staff";
import { formatMinuteOfDay, formatStripDay } from "@/lib/format";

const MINUTES_PER_DAY = 24 * 60;
const MINUTES_PER_HOUR = 60;

/** Where the axis lands when a shop has no hours set and no bookings yet. */
const FALLBACK_START_MINUTE = 8 * MINUTES_PER_HOUR;
const FALLBACK_END_MINUTE = 20 * MINUTES_PER_HOUR;

/**
 * The shortest span the axis will render. Without it, a day holding one 30-minute
 * booking and no working hours produces a one-hour-tall grid — technically
 * correct and visually useless.
 */
const MIN_GRID_MINUTES = 6 * MINUTES_PER_HOUR;

/**
 * The height a zero- or negative-length booking is drawn at, so it stays
 * clickable and visible. Reachable only across a backward DST transition — see
 * positionBooking.
 */
const MIN_VISIBLE_MINUTES = 10;

/** A booking's span in tenant-local minutes from midnight. */
export type BookingSpan = {
  /** Always within [0, MINUTES_PER_DAY). */
  startMinute: number;
  /** Always greater than startMinute, and at most MINUTES_PER_DAY. */
  endMinute: number;
};

/** A booking placed on the grid: its span, its lane, and its box. */
export type PlacedBooking = BookingSpan & {
  booking: DashboardBooking;
  /** 0-based horizontal slot within an overlapping cluster. */
  lane: number;
  /** How many lanes that cluster needs. 1 when nothing overlaps. */
  laneCount: number;
  /** Percent of the grid's height, ready for a `style` prop. */
  topPercent: number;
  heightPercent: number;
};

/** One vertical strip of the grid: a barber in the day view, a day in the week view. */
export type GridColumn = {
  /** Stable React key — a staff id or an ISO date. */
  key: string;
  label: string;
  /** Second line of the header, or null when the label says it all. */
  sublabel: string | null;
  /** Drawn dimmer: a barber who no longer works here. */
  muted: boolean;
  /** Drawn with emphasis: today, in the week view. */
  highlight: boolean;
  bookings: PlacedBooking[];
};

/** A labelled horizontal rule on the time axis. */
export type HourMark = {
  minute: number;
  /** "09:00" */
  label: string;
  topPercent: number;
};

export type CalendarGrid = {
  /** Tenant-local minute the axis starts at. Always a whole hour. */
  startMinute: number;
  endMinute: number;
  hourMarks: HourMark[];
  columns: GridColumn[];
};

/**
 * A booking's span in the tenant's wall clock, on the local day it starts on.
 *
 * Two clamps, both of which exist for a real case rather than for tidiness:
 *
 * - An appointment running past local midnight ends at midnight as far as the
 *   grid is concerned. getBookingsForRange files a booking under the day it
 *   *starts* on, so the tail has no column to grow into, and left unclamped it
 *   would draw a block hanging off the bottom of the grid.
 * - An appointment straddling a backward DST transition ends, in wall-clock
 *   terms, before it started: 02:45 + 30 minutes reads as 02:15 once the clocks
 *   go back. That's a negative height. It needs a shop open at 3am to happen,
 *   but a negative height is the kind of thing that renders as a garbage box
 *   rather than as nothing, so it gets a floor instead of a shrug.
 */
export function positionBooking(
  booking: DashboardBooking,
  timezone: string,
): BookingSpan {
  const start = localParts(booking.startAt, timezone);
  const end = localParts(booking.endAt, timezone);

  const startMinute = start.minute;
  const sameDay = start.date === end.date;
  const rawEnd = sameDay ? end.minute : MINUTES_PER_DAY;

  const endMinute =
    rawEnd > startMinute
      ? rawEnd
      : Math.min(startMinute + MIN_VISIBLE_MINUTES, MINUTES_PER_DAY);

  return { startMinute, endMinute };
}

/**
 * The axis extent covering every booking and every working-hours row given.
 *
 * Working hours are in so the grid shows the shop's day even before anyone has
 * booked; bookings are in so nothing can fall outside the axis — a walk-in
 * entered at 07:00 on a shop that opens at 09:00 must widen the grid, not
 * disappear off the top of it. Rounded outward to whole hours so the labels sit
 * on the lines.
 */
export function gridBounds(
  spans: BookingSpan[],
  workingHours: WorkingHoursRow[],
): { startMinute: number; endMinute: number } {
  const starts = [
    ...spans.map((span) => span.startMinute),
    ...workingHours.map((row) => row.startMinute),
  ];
  const ends = [
    ...spans.map((span) => span.endMinute),
    ...workingHours.map((row) => row.endMinute),
  ];

  if (starts.length === 0 || ends.length === 0) {
    return {
      startMinute: FALLBACK_START_MINUTE,
      endMinute: FALLBACK_END_MINUTE,
    };
  }

  let startMinute = clamp(floorToHour(Math.min(...starts)), 0, MINUTES_PER_DAY);
  let endMinute = clamp(ceilToHour(Math.max(...ends)), 0, MINUTES_PER_DAY);

  // Grow the window to the minimum span — downward first, since a shop's day
  // reads more naturally extended into the evening than into the small hours.
  if (endMinute - startMinute < MIN_GRID_MINUTES) {
    endMinute = Math.min(startMinute + MIN_GRID_MINUTES, MINUTES_PER_DAY);
    // Only bites for a late-evening booking, where growing downward ran into
    // midnight and the remainder has to come off the top instead.
    startMinute = Math.max(endMinute - MIN_GRID_MINUTES, 0);
  }

  return { startMinute, endMinute };
}

/**
 * Splits one column's bookings into non-overlapping lanes.
 *
 * The calendar cannot assume its bookings don't overlap, which is easy to get
 * backwards: the `no_overlapping_bookings` exclusion constraint only ranges over
 * CONFIRMED and COMPLETED (see OCCUPYING_STATUSES in lib/db/availability.ts).
 * CANCELLED and NO_SHOW sit outside it, so once the dashboard can mark a no-show
 * that slot reopens and a walk-in can legitimately be booked straight over it.
 * The result is two live blocks on one barber at one time, and a layout that
 * assumed uniqueness would stack them exactly on top of each other — hiding the
 * newer appointment behind the one it replaced.
 *
 * Lanes are counted per *cluster* of mutually overlapping bookings, not per
 * column: one 09:00 clash must not squeeze a lone 17:00 appointment into half
 * the width for the rest of the day.
 */
export function assignLanes(
  spans: (BookingSpan & { booking: DashboardBooking })[],
): Omit<PlacedBooking, "topPercent" | "heightPercent">[] {
  // getBookingsForRange already orders by startAt, but this function is the one
  // place the sweep's correctness depends on that order, so it states it rather
  // than inherits it. Longer bookings first on a tie keeps the big block on the
  // left, where it reads as the primary appointment.
  const sorted = [...spans].sort(
    (a, b) =>
      a.startMinute - b.startMinute ||
      b.endMinute - a.endMinute ||
      a.booking.id.localeCompare(b.booking.id),
  );

  const placed: Omit<PlacedBooking, "topPercent" | "heightPercent">[] = [];
  // Index into `placed` where the current cluster began, so its laneCount can be
  // written back across all its members once the cluster closes.
  let clusterStart = 0;
  let clusterEnd = -Infinity;
  /** The end minute of the last booking assigned to each lane. */
  let laneEnds: number[] = [];

  const closeCluster = () => {
    for (let i = clusterStart; i < placed.length; i += 1) {
      placed[i].laneCount = laneEnds.length;
    }
  };

  for (const span of sorted) {
    if (span.startMinute >= clusterEnd) {
      // Nothing still running: everything before this is a settled cluster.
      closeCluster();
      clusterStart = placed.length;
      clusterEnd = -Infinity;
      laneEnds = [];
    }

    let lane = laneEnds.findIndex((end) => end <= span.startMinute);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(span.endMinute);
    } else {
      laneEnds[lane] = span.endMinute;
    }

    placed.push({
      booking: span.booking,
      startMinute: span.startMinute,
      endMinute: span.endMinute,
      lane,
      // Provisional — rewritten by closeCluster once the cluster is known.
      laneCount: 1,
    });

    clusterEnd = Math.max(clusterEnd, span.endMinute);
  }

  closeCluster();

  return placed;
}

export type BuildGridInput = {
  bookings: DashboardBooking[];
  workingHours: WorkingHoursRow[];
  timezone: string;
};

/**
 * The day view: one column per barber, plus any barber who has a booking today
 * but no longer works here.
 *
 * Active barbers always get a column, empty or not — an empty column is the
 * honest picture of a quiet day and is where Day 11's click-to-book will live.
 * Inactive ones appear only when they actually have something on the books, so a
 * shop that has been through five barbers doesn't carry five dead columns
 * forever. See getStaffForCalendar for why they can't simply be dropped.
 */
export function buildDayGrid(
  input: BuildGridInput & { staff: CalendarStaff[] },
): CalendarGrid {
  const { bookings, staff, workingHours, timezone } = input;

  const spans = bookings.map((booking) => ({
    booking,
    ...positionBooking(booking, timezone),
  }));

  const byStaff = new Map<string, typeof spans>();
  for (const span of spans) {
    const key = span.booking.staff.id;
    const existing = byStaff.get(key);
    if (existing) existing.push(span);
    else byStaff.set(key, [span]);
  }

  const columns: Omit<GridColumn, "bookings">[] = [];

  for (const member of staff) {
    // A retired barber with an empty day contributes nothing worth a column.
    if (!member.active && !byStaff.has(member.id)) continue;

    columns.push({
      key: member.id,
      label: member.name,
      sublabel: member.active ? null : "No longer here",
      muted: !member.active,
      highlight: false,
    });
  }

  // A booking whose barber isn't in the staff list at all shouldn't be possible —
  // the foreign key and createBooking's tenant re-check together guarantee it.
  // Given the whole point of the column rules above is that no appointment can
  // silently vanish, an impossible case is still cheaper to render than to trust.
  const known = new Set(columns.map((column) => column.key));
  for (const span of spans) {
    const { id, name } = span.booking.staff;
    if (known.has(id)) continue;

    known.add(id);
    columns.push({
      key: id,
      label: name,
      sublabel: "Unknown barber",
      muted: true,
      highlight: false,
    });
  }

  return assemble(
    columns.map((column) => ({
      column,
      spans: byStaff.get(column.key) ?? [],
    })),
    spans,
    workingHours,
  );
}

/**
 * The week view: one column per day, Monday first, every barber's work merged.
 *
 * Deliberately not a barber × day matrix. Four barbers across seven days is
 * twenty-eight columns of unreadable slivers; the week view answers "how full is
 * next week", and the day view is where "who is doing what" gets answered.
 * Merging the barbers is exactly why assignLanes matters here — four
 * simultaneous 10:00 appointments are the normal case in this view, not an edge
 * one.
 */
export function buildWeekGrid(
  input: BuildGridInput & { dates: string[]; now: Date },
): CalendarGrid {
  const { bookings, dates, workingHours, timezone, now } = input;

  const spans = bookings.map((booking) => ({
    booking,
    ...positionBooking(booking, timezone),
    date: localParts(booking.startAt, timezone).date,
  }));

  const today = localParts(now, timezone).date;

  const columns = dates.map((date) => {
    const { weekday, dayOfMonth } = formatStripDay(date, timezone);

    return {
      column: {
        key: date,
        label: weekday,
        sublabel: dayOfMonth,
        muted: false,
        highlight: date === today,
      },
      spans: spans.filter((span) => span.date === date),
    };
  });

  return assemble(columns, spans, workingHours);
}

/**
 * Shared tail of both builders: one axis for the whole grid, then each column's
 * bookings laned and converted to percentages against it.
 *
 * The bounds are computed once across *every* column rather than per column —
 * columns whose axes disagreed would put 10:00 at a different height in each,
 * which is the one thing a calendar may not do.
 */
function assemble(
  columns: {
    column: Omit<GridColumn, "bookings">;
    spans: (BookingSpan & { booking: DashboardBooking })[];
  }[],
  allSpans: BookingSpan[],
  workingHours: WorkingHoursRow[],
): CalendarGrid {
  const { startMinute, endMinute } = gridBounds(allSpans, workingHours);
  const span = endMinute - startMinute;

  const toPercent = (minute: number) => ((minute - startMinute) / span) * 100;

  const hourMarks: HourMark[] = [];
  for (
    let minute = startMinute;
    minute <= endMinute;
    minute += MINUTES_PER_HOUR
  ) {
    hourMarks.push({
      minute,
      label: formatMinuteOfDay(minute % MINUTES_PER_DAY),
      topPercent: toPercent(minute),
    });
  }

  return {
    startMinute,
    endMinute,
    hourMarks,
    columns: columns.map(({ column, spans }) => ({
      ...column,
      bookings: assignLanes(spans).map((placed) => {
        const topPercent = clamp(toPercent(placed.startMinute), 0, 100);

        return {
          ...placed,
          topPercent,
          // Clamped against the top offset, not against 100 alone, so a block
          // running to the edge stops there instead of overflowing the grid.
          heightPercent: clamp(
            ((placed.endMinute - placed.startMinute) / span) * 100,
            0,
            100 - topPercent,
          ),
        };
      }),
    })),
  };
}

/**
 * The weekday numbers, in schema.prisma's 0 = Sunday .. 6 numbering, that a set
 * of tenant-local dates falls on — for filtering WorkingHours down to the days
 * actually on screen.
 *
 * Luxon counts 1 = Monday .. 7 = Sunday, so `% 7` reconciles them (Sunday:
 * 7 % 7 = 0). Same conversion computeSlots makes, and the same off-by-one that
 * silently shifts everyone's hours by a day if it's dropped.
 */
export function weekdaysOf(dates: string[], timezone: string): number[] {
  const seen = new Set<number>();

  for (const date of dates) {
    const parsed = DateTime.fromISO(date, { zone: timezone });
    if (!parsed.isValid) {
      throw new Error(
        `weekdaysOf: invalid date "${date}" for timezone "${timezone}"`,
      );
    }

    seen.add(parsed.weekday % 7);
  }

  return [...seen];
}

/** The tenant-local calendar day and minute-of-day a UTC instant falls on. */
function localParts(instant: Date, timezone: string): {
  date: string;
  minute: number;
} {
  const local = DateTime.fromJSDate(instant).setZone(timezone);

  if (!local.isValid) {
    throw new Error(`localParts: invalid timezone "${timezone}"`);
  }

  return {
    date: local.toISODate() as string,
    minute: local.hour * MINUTES_PER_HOUR + local.minute,
  };
}

function floorToHour(minute: number): number {
  return Math.floor(minute / MINUTES_PER_HOUR) * MINUTES_PER_HOUR;
}

function ceilToHour(minute: number): number {
  return Math.ceil(minute / MINUTES_PER_HOUR) * MINUTES_PER_HOUR;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
