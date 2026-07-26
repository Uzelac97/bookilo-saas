/**
 * "When is this shop open?" — the union of every active barber's working hours,
 * merged into one displayable set of intervals per weekday.
 *
 * There is no business-level opening-hours field, by design (EXECUTION-PLAN.md):
 * hours live per staff member, and "closed Sunday" means no staff has Sunday
 * rows. That makes the public answer a merge, not a lookup — two barbers on
 * 09:00–13:00 and 13:00–18:00 must read as one 09:00–18:00 line, and three
 * barbers on the same shift must read as one line, not three.
 *
 * PURE, like slots.ts next door. No I/O and no Date: these are integer
 * minutes-from-midnight in tenant-local wall clock, so there is no instant to
 * convert and no DST hazard to get wrong. That's why this file has no Luxon
 * import — the CLAUDE.md rule is about date math across timezones, and there is
 * none here. The moment this needs a real instant, it needs Luxon.
 *
 * This is display-only. Bookability is decided by computeSlots, which reads the
 * same rows independently — do not route availability through here.
 */
import type { WorkingHoursRow } from "./slots";

export type OpeningInterval = { startMinute: number; endMinute: number };

export type DayOpeningHours = {
  /** 0 = Sunday .. 6 = Saturday, per schema.prisma. */
  dayOfWeek: number;
  /** Ascending, non-overlapping, non-touching. Empty means closed. */
  intervals: OpeningInterval[];
};

const MINUTES_PER_DAY = 24 * 60;

/**
 * Monday-first, which is how a European barbershop reads its own week — the
 * schema's 0 = Sunday numbering is storage, not presentation. Keeping the
 * reordering here rather than in a component is what stops a second, subtly
 * different weekday mapping from appearing in the UI layer.
 */
export const DISPLAY_WEEK = [1, 2, 3, 4, 5, 6, 0] as const;

export const WEEKDAY_LABELS: Record<number, string> = {
  0: "Sunday",
  1: "Monday",
  2: "Tuesday",
  3: "Wednesday",
  4: "Thursday",
  5: "Friday",
  6: "Saturday",
};

/**
 * All seven days in display order, each with its merged intervals.
 *
 * Always returns seven entries: a closed day is an empty `intervals` array, not
 * a missing one, so the caller renders "Closed" instead of silently dropping
 * the row.
 */
export function mergeOpeningHours(rows: WorkingHoursRow[]): DayOpeningHours[] {
  const byDay = new Map<number, OpeningInterval[]>();

  for (const row of rows) {
    if (!isUsableRow(row)) continue;

    const day = byDay.get(row.dayOfWeek);
    const interval = {
      startMinute: row.startMinute,
      endMinute: row.endMinute,
    };

    if (day) {
      day.push(interval);
    } else {
      byDay.set(row.dayOfWeek, [interval]);
    }
  }

  return DISPLAY_WEEK.map((dayOfWeek) => ({
    dayOfWeek,
    intervals: mergeIntervals(byDay.get(dayOfWeek) ?? []),
  }));
}

/**
 * The same sanity guard toWindow applies in slots.ts. A backwards or
 * out-of-range row is dropped rather than rendered as "18:00 – 09:00" — the
 * dashboard's staff-hours editor (Day 11) is what should prevent it existing,
 * but a public page is the wrong place to find out that it didn't.
 */
function isUsableRow(row: WorkingHoursRow): boolean {
  return (
    Number.isInteger(row.dayOfWeek) &&
    row.dayOfWeek >= 0 &&
    row.dayOfWeek <= 6 &&
    row.startMinute >= 0 &&
    row.endMinute <= MINUTES_PER_DAY &&
    row.endMinute > row.startMinute
  );
}

/**
 * Overlapping *and* touching intervals collapse. Touching matters as much as
 * overlapping here: a morning barber ending at 13:00 and an afternoon one
 * starting at 13:00 mean the shop is open straight through, and rendering that
 * as two lines makes it look like there's a break when there isn't.
 *
 * A genuine gap — 13:00 to 14:00 with nobody working — stays two intervals,
 * which is the whole point of not just taking min(start) and max(end).
 */
function mergeIntervals(intervals: OpeningInterval[]): OpeningInterval[] {
  const sorted = [...intervals].sort(
    (a, b) => a.startMinute - b.startMinute || a.endMinute - b.endMinute,
  );

  const merged: OpeningInterval[] = [];

  for (const interval of sorted) {
    const last = merged[merged.length - 1];

    if (last && interval.startMinute <= last.endMinute) {
      last.endMinute = Math.max(last.endMinute, interval.endMinute);
      continue;
    }

    merged.push({ ...interval });
  }

  return merged;
}
