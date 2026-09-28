import { describe, expect, it } from "vitest";

import {
  calendarRange,
  rangeContainsToday,
  resolveCalendarDate,
  resolveCalendarView,
  shiftCalendarDate,
  weekDays,
} from "./calendar-range";

const TZ = "Europe/Berlin";

/** A UTC instant, written the way the database stores one. */
function utc(iso: string): Date {
  return new Date(`${iso}Z`);
}

// A Monday, so the Monday-first week rules have an unambiguous anchor.
const MONDAY = "2026-07-27";
const NOW = utc("2026-07-27T09:00:00");

describe("resolveCalendarView", () => {
  it("reads both views", () => {
    expect(resolveCalendarView("day")).toBe("day");
    expect(resolveCalendarView("week")).toBe("week");
  });

  it("falls back to the day view rather than throwing on a junk parameter", () => {
    // A stale bookmark or a hand-edited URL should land somewhere sensible.
    expect(resolveCalendarView(undefined)).toBe("day");
    expect(resolveCalendarView("month")).toBe("day");
    expect(resolveCalendarView("")).toBe("day");
  });
});

describe("resolveCalendarDate", () => {
  it("takes a valid date as given", () => {
    expect(resolveCalendarDate("2026-08-14", NOW, TZ)).toBe("2026-08-14");
  });

  it("defaults to the shop's today when the parameter is missing or unparseable", () => {
    expect(resolveCalendarDate(undefined, NOW, TZ)).toBe(MONDAY);
    expect(resolveCalendarDate("not-a-date", NOW, TZ)).toBe(MONDAY);
    expect(resolveCalendarDate("2026-13-45", NOW, TZ)).toBe(MONDAY);
  });

  // THE point of this module existing separately from booking-options.ts. If
  // someone ever "simplifies" by reusing resolveBookingDate, these two fail —
  // that function clamps to [today, today + 30] because a customer may not book
  // the past, and it would silently pin the owner's calendar to today or later.
  it("allows past dates, which the customer-facing resolver does not", () => {
    expect(resolveCalendarDate("2026-07-20", NOW, TZ)).toBe("2026-07-20");
    expect(resolveCalendarDate("2025-01-02", NOW, TZ)).toBe("2025-01-02");
  });

  it("allows dates beyond the customer booking horizon", () => {
    // Well past today + BOOKING_HORIZON_DAYS. An owner planning holiday cover
    // needs to see it; a customer may not book it.
    expect(resolveCalendarDate("2027-03-01", NOW, TZ)).toBe("2027-03-01");
  });
});

describe("weekDays", () => {
  it("returns the Monday-first week containing the date", () => {
    expect(weekDays(MONDAY, TZ)).toEqual([
      "2026-07-27",
      "2026-07-28",
      "2026-07-29",
      "2026-07-30",
      "2026-07-31",
      "2026-08-01",
      "2026-08-02",
    ]);
  });

  it("puts a Sunday at the end of its week, not the start of the next one", () => {
    // The off-by-one that would shift the whole grid by a week for one day in
    // seven, on the day an owner is most likely to be reviewing it.
    expect(weekDays("2026-08-02", TZ)).toEqual(weekDays(MONDAY, TZ));
  });

  it("spans a month boundary without losing a day", () => {
    expect(weekDays("2026-07-30", TZ)).toHaveLength(7);
  });

  it("still returns seven days across a DST transition", () => {
    // 25 Oct 2026 is the 25-hour day. Stepping by fixed milliseconds instead of
    // calendar days would repeat or skip a date inside this week.
    expect(weekDays("2026-10-25", TZ)).toEqual([
      "2026-10-19",
      "2026-10-20",
      "2026-10-21",
      "2026-10-22",
      "2026-10-23",
      "2026-10-24",
      "2026-10-25",
    ]);
  });
});

describe("calendarRange", () => {
  it("covers a single day in the day view", () => {
    expect(calendarRange("2026-07-29", "day", TZ)).toEqual({
      fromDate: "2026-07-29",
      toDate: "2026-07-29",
    });
  });

  it("covers the whole containing week in the week view", () => {
    // Deliberately not seven days *starting* from the selection: an owner who
    // clicks Wednesday and switches to the week view expects that week, with
    // Wednesday in its usual place.
    expect(calendarRange("2026-07-29", "week", TZ)).toEqual({
      fromDate: "2026-07-27",
      toDate: "2026-08-02",
    });
  });
});

describe("shiftCalendarDate", () => {
  it("steps by one day in the day view, in both directions", () => {
    expect(shiftCalendarDate(MONDAY, "day", 1, TZ)).toBe("2026-07-28");
    expect(shiftCalendarDate(MONDAY, "day", -1, TZ)).toBe("2026-07-26");
  });

  it("steps by a whole week in the week view, keeping the weekday", () => {
    // Keeping the weekday is what stops the grid sliding sideways under the
    // owner as they page: Thursday pages to Thursday.
    expect(shiftCalendarDate("2026-07-30", "week", 1, TZ)).toBe("2026-08-06");
    expect(shiftCalendarDate("2026-07-30", "week", -1, TZ)).toBe("2026-07-23");
  });

  it("crosses a DST transition without skipping or repeating a day", () => {
    expect(shiftCalendarDate("2026-10-24", "day", 1, TZ)).toBe("2026-10-25");
    expect(shiftCalendarDate("2026-10-25", "day", 1, TZ)).toBe("2026-10-26");
    expect(shiftCalendarDate("2026-03-28", "day", 1, TZ)).toBe("2026-03-29");
  });

  it("crosses a year boundary", () => {
    expect(shiftCalendarDate("2026-12-31", "day", 1, TZ)).toBe("2027-01-01");
  });
});

describe("rangeContainsToday", () => {
  it("is true for the day view on today and false on any other day", () => {
    expect(rangeContainsToday(calendarRange(MONDAY, "day", TZ), NOW, TZ)).toBe(
      true,
    );
    expect(
      rangeContainsToday(calendarRange("2026-07-28", "day", TZ), NOW, TZ),
    ).toBe(false);
  });

  it("is true anywhere in the week view's week, not only on today itself", () => {
    // The "Today" button has to be dead for the whole of this week — offering to
    // navigate somewhere already on screen is a control that does nothing.
    expect(
      rangeContainsToday(calendarRange("2026-08-01", "week", TZ), NOW, TZ),
    ).toBe(true);
    expect(
      rangeContainsToday(calendarRange("2026-08-05", "week", TZ), NOW, TZ),
    ).toBe(false);
  });
});
