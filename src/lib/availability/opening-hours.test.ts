import { describe, expect, it } from "vitest";

import {
  DISPLAY_WEEK,
  mergeOpeningHours,
  type DayOpeningHours,
} from "./opening-hours";
import type { WorkingHoursRow } from "./slots";

// schema.prisma numbers days 0 = Sunday .. 6 = Saturday.
const MONDAY = 1;
const SUNDAY = 0;

/** Minutes from midnight, written the way a barber would say it. */
function at(hour: number, minute = 0): number {
  return hour * 60 + minute;
}

function row(
  dayOfWeek: number,
  startMinute: number,
  endMinute: number,
): WorkingHoursRow {
  return { dayOfWeek, startMinute, endMinute };
}

/** The merged intervals for one day, as "HH:mm-HH:mm" strings. */
function intervalsOn(days: DayOpeningHours[], dayOfWeek: number): string[] {
  const day = days.find((entry) => entry.dayOfWeek === dayOfWeek);
  if (!day) throw new Error(`no entry for dayOfWeek ${dayOfWeek}`);

  return day.intervals.map(
    (interval) => `${hhmm(interval.startMinute)}-${hhmm(interval.endMinute)}`,
  );
}

function hhmm(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(
    minute % 60,
  ).padStart(2, "0")}`;
}

describe("mergeOpeningHours", () => {
  it("returns all seven days, Monday first", () => {
    const days = mergeOpeningHours([]);

    expect(days).toHaveLength(7);
    expect(days.map((day) => day.dayOfWeek)).toEqual([...DISPLAY_WEEK]);
  });

  it("reports a day with no rows as closed rather than dropping it", () => {
    const days = mergeOpeningHours([row(MONDAY, at(9), at(18))]);

    expect(intervalsOn(days, SUNDAY)).toEqual([]);
    expect(intervalsOn(days, MONDAY)).toEqual(["09:00-18:00"]);
  });

  it("collapses two barbers on identical shifts into one interval", () => {
    const days = mergeOpeningHours([
      row(MONDAY, at(9), at(18)),
      row(MONDAY, at(9), at(18)),
    ]);

    expect(intervalsOn(days, MONDAY)).toEqual(["09:00-18:00"]);
  });

  it("merges overlapping shifts", () => {
    const days = mergeOpeningHours([
      row(MONDAY, at(9), at(14)),
      row(MONDAY, at(12), at(18)),
    ]);

    expect(intervalsOn(days, MONDAY)).toEqual(["09:00-18:00"]);
  });

  it("merges shifts that only touch — the shop is open straight through", () => {
    const days = mergeOpeningHours([
      row(MONDAY, at(9), at(13)),
      row(MONDAY, at(13), at(18)),
    ]);

    expect(intervalsOn(days, MONDAY)).toEqual(["09:00-18:00"]);
  });

  it("keeps a genuine gap as two intervals", () => {
    const days = mergeOpeningHours([
      row(MONDAY, at(9), at(13)),
      row(MONDAY, at(14), at(18)),
    ]);

    expect(intervalsOn(days, MONDAY)).toEqual(["09:00-13:00", "14:00-18:00"]);
  });

  it("merges regardless of input order", () => {
    const days = mergeOpeningHours([
      row(MONDAY, at(14), at(18)),
      row(MONDAY, at(9), at(13)),
      row(MONDAY, at(11), at(15)),
    ]);

    expect(intervalsOn(days, MONDAY)).toEqual(["09:00-18:00"]);
  });

  it("does not let a long shift swallow a later, shorter one it contains", () => {
    const days = mergeOpeningHours([
      row(MONDAY, at(9), at(18)),
      row(MONDAY, at(11), at(12)),
    ]);

    expect(intervalsOn(days, MONDAY)).toEqual(["09:00-18:00"]);
  });

  it("keeps each weekday independent", () => {
    const days = mergeOpeningHours([
      row(MONDAY, at(9), at(18)),
      row(6, at(9), at(14)),
    ]);

    expect(intervalsOn(days, MONDAY)).toEqual(["09:00-18:00"]);
    expect(intervalsOn(days, 6)).toEqual(["09:00-14:00"]);
    expect(intervalsOn(days, SUNDAY)).toEqual([]);
  });

  it("drops unusable rows instead of rendering them backwards", () => {
    const days = mergeOpeningHours([
      row(MONDAY, at(18), at(9)), // backwards
      row(MONDAY, at(10), at(10)), // zero length
      row(MONDAY, -60, at(9)), // before midnight
      row(MONDAY, at(9), 24 * 60 + 60), // past midnight
      row(9, at(9), at(18)), // not a weekday
      row(MONDAY, at(9), at(18)), // the only good one
    ]);

    expect(intervalsOn(days, MONDAY)).toEqual(["09:00-18:00"]);
  });

  it("accepts a shift that closes exactly at midnight", () => {
    const days = mergeOpeningHours([row(MONDAY, at(20), 24 * 60)]);

    expect(intervalsOn(days, MONDAY)).toEqual(["20:00-24:00"]);
  });

  it("does not mutate the caller's rows", () => {
    const rows = [row(MONDAY, at(9), at(13)), row(MONDAY, at(13), at(18))];
    const before = structuredClone(rows);

    mergeOpeningHours(rows);

    expect(rows).toEqual(before);
  });
});
