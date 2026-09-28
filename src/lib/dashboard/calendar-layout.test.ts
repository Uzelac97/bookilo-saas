import { DateTime } from "luxon";
import { describe, expect, it } from "vitest";

import type { WorkingHoursRow } from "@/lib/availability/slots";
import type { DashboardBooking } from "@/lib/db/bookings";
import type { CalendarStaff } from "@/lib/db/staff";

import {
  assignLanes,
  blockDensity,
  buildDayGrid,
  buildWeekGrid,
  CALENDAR_PX_PER_HOUR,
  gridBounds,
  groupByLocalDate,
  positionBooking,
  weekdaysOf,
  type BlockDensity,
  type BookingSpan,
} from "./calendar-layout";

const TZ = "Europe/Berlin";

/** A UTC instant, written the way the database stores one. */
function utc(iso: string): Date {
  return new Date(`${iso}Z`);
}

/** A UTC instant from a tenant-local wall clock time — how a fixture is written. */
function local(date: string, time: string, zone = TZ): Date {
  return DateTime.fromISO(`${date}T${time}`, { zone }).toJSDate();
}

const MARCO = { id: "staff-marco", name: "Marco Rossi" };
const IVAN = { id: "staff-ivan", name: "Ivan Petrov" };
const GONE = { id: "staff-gone", name: "Nikola Old" };

let seq = 0;

/**
 * A booking between two instants. Only the fields the layout functions read
 * carry meaning — the rest exist so the value is a real DashboardBooking rather
 * than a cast.
 */
function booking(
  startAt: Date,
  endAt: Date,
  overrides: Partial<Pick<DashboardBooking, "id" | "staff" | "status">> = {},
): DashboardBooking {
  seq += 1;

  return {
    id: overrides.id ?? `booking-${seq}`,
    startAt,
    endAt,
    status: overrides.status ?? "CONFIRMED",
    source: "ONLINE",
    service: { name: "Haircut", nameEn: null, priceMinorUnits: 2500 },
    staff: overrides.staff ?? MARCO,
    customer: { name: "Luka M.", phone: "+4930111", email: null },
  };
}

/** A booking written as tenant-local wall clock on one local day. */
function at(
  date: string,
  from: string,
  to: string,
  overrides: Partial<Pick<DashboardBooking, "id" | "staff" | "status">> = {},
): DashboardBooking {
  return booking(local(date, from), local(date, to), overrides);
}

function staffMember(
  id: string,
  name: string,
  active = true,
): CalendarStaff {
  return { id, name, active };
}

/** 2026-07-28 is a Tuesday -> dayOfWeek 2 in the schema's 0 = Sunday numbering. */
const TUESDAY = "2026-07-28";
const TUESDAY_DOW = 2;

/** 09:00–18:00, the shop's ordinary shift. */
function hours(
  dayOfWeek: number,
  startMinute = 9 * 60,
  endMinute = 18 * 60,
): WorkingHoursRow {
  return { dayOfWeek, startMinute, endMinute };
}

/** Every weekday 08:00–18:00 — a 600-minute axis, which makes percentages whole. */
const WIDE_WEEK: WorkingHoursRow[] = [0, 1, 2, 3, 4, 5, 6].map((d) =>
  hours(d, 8 * 60, 18 * 60),
);

// ---------------------------------------------------------------------------
// positionBooking
// ---------------------------------------------------------------------------

describe("positionBooking", () => {
  it("reads the local wall clock on an ordinary day", () => {
    // Exists so the DST cases below cannot pass vacuously: on a 24-hour day
    // wall clock and elapsed-time-since-midnight agree, so this must be right
    // for either implementation.
    const span = positionBooking(at(TUESDAY, "14:00", "14:45"), TZ);

    expect(span).toEqual({ startMinute: 840, endMinute: 885 });
  });

  it("positions from the wall clock, not elapsed time, on the 25-hour day", () => {
    // THE bug this module exists to prevent. 2026-10-25 is Europe/Berlin's
    // fall-back day: clocks go 03:00 CEST -> 02:00 CET, so the local day is 25
    // hours long. 14:00 local is CET (UTC+1) = 13:00 UTC. An implementation
    // that measures elapsed milliseconds from local midnight (which was
    // 2026-10-24T22:00Z, still CEST) gets 15 hours and answers 900 — the
    // booking would render an hour low, on top of the 15:00 appointment.
    const span = positionBooking(
      booking(utc("2026-10-25T13:00:00"), utc("2026-10-25T13:45:00")),
      TZ,
    );

    expect(span.startMinute, "14:00 local must be minute 840, not elapsed 900").toBe(
      840,
    );
    expect(span.endMinute).toBe(885);
  });

  it("positions from the wall clock, not elapsed time, on the 23-hour day", () => {
    // 2026-03-29 is spring-forward: 02:00 CET -> 03:00 CEST, a 23-hour local
    // day. 14:00 local is CEST (UTC+2) = 12:00 UTC. Local midnight was
    // 2026-03-28T23:00Z, so elapsed time answers 780 — an hour high.
    const span = positionBooking(
      booking(utc("2026-03-29T12:00:00"), utc("2026-03-29T12:30:00")),
      TZ,
    );

    expect(span.startMinute, "14:00 local must be minute 840, not elapsed 780").toBe(
      840,
    );
    expect(span.endMinute).toBe(870);
  });

  it("agrees with the wall clock the fixture was written in, both sides of the year", () => {
    // Same assertion phrased from the other direction: a fixture written as
    // "09:00 local" must come back as 540 in winter (UTC+1) and summer (UTC+2).
    expect(positionBooking(at("2026-01-13", "09:00", "09:30"), TZ).startMinute).toBe(
      540,
    );
    expect(positionBooking(at("2026-07-13", "09:00", "09:30"), TZ).startMinute).toBe(
      540,
    );
  });

  it("clamps to midnight when the booking runs into the next local day", () => {
    // The grid files a booking under the day it starts on, so the tail has
    // nowhere to go.
    const span = positionBooking(
      booking(local(TUESDAY, "23:30"), local("2026-07-29", "00:15")),
      TZ,
    );

    expect(span).toEqual({ startMinute: 1410, endMinute: 1440 });
  });

  it("keeps a booking that ends exactly at local midnight on its own day", () => {
    const span = positionBooking(
      booking(local(TUESDAY, "23:00"), local("2026-07-29", "00:00")),
      TZ,
    );

    // 00:00 the next day is minute 1440 of this one either way — clamped or
    // computed, the answer is the same.
    expect(span).toEqual({ startMinute: 1380, endMinute: 1440 });
  });

  it("gives a minimum visible span when the wall clock runs backwards", () => {
    // Only reachable across the backward transition: 00:30 UTC on 2026-10-25 is
    // 02:30 CEST, and 01:00 UTC — thirty real minutes later — is 02:00 CET.
    // The wall clock went backwards, so the honest end (120) is before the
    // start (150). Falls back to start + 10.
    const span = positionBooking(
      booking(utc("2026-10-25T00:30:00"), utc("2026-10-25T01:00:00")),
      TZ,
    );

    expect(span.startMinute).toBe(150);
    expect(span.endMinute).toBe(160);
  });

  it("gives a minimum visible span to a zero-length booking", () => {
    const span = positionBooking(at(TUESDAY, "10:00", "10:00"), TZ);

    expect(span).toEqual({ startMinute: 600, endMinute: 610 });
  });

  it("resolves the local day in the tenant's zone, not UTC", () => {
    // 23:30 UTC on 27 July is 01:30 Berlin on 28 July. A UTC reading would
    // place this at minute 1410 of the wrong day.
    const span = positionBooking(
      booking(utc("2026-07-27T23:30:00"), utc("2026-07-28T00:15:00")),
      TZ,
    );

    expect(span).toEqual({ startMinute: 90, endMinute: 135 });
  });
});

// ---------------------------------------------------------------------------
// gridBounds
// ---------------------------------------------------------------------------

describe("gridBounds", () => {
  it("falls back to 08:00–20:00 for a shop with nothing on the books and no hours", () => {
    expect(gridBounds([], [])).toEqual({ startMinute: 480, endMinute: 1200 });
  });

  it("spans the union of working hours and bookings", () => {
    const spans: BookingSpan[] = [{ startMinute: 600, endMinute: 660 }];

    expect(gridBounds(spans, [hours(TUESDAY_DOW)])).toEqual({
      startMinute: 540,
      endMinute: 1080,
    });
  });

  it("rounds the start down and the end up to whole hours", () => {
    const spans: BookingSpan[] = [{ startMinute: 545, endMinute: 1085 }];

    expect(gridBounds(spans, [])).toEqual({ startMinute: 540, endMinute: 1140 });
  });

  it("leaves a start already on the hour alone rather than dropping an hour", () => {
    const spans: BookingSpan[] = [{ startMinute: 540, endMinute: 1080 }];

    expect(gridBounds(spans, [])).toEqual({ startMinute: 540, endMinute: 1080 });
  });

  it("widens the window around a booking that falls outside working hours", () => {
    // A 07:00 walk-in at a shop that opens at 09:00 must move the axis, not be
    // cropped off the top of the calendar.
    const spans: BookingSpan[] = [{ startMinute: 420, endMinute: 450 }];

    expect(gridBounds(spans, [hours(TUESDAY_DOW)])).toEqual({
      startMinute: 420,
      endMinute: 1080,
    });
  });

  it("widens a too-narrow window to the six-hour minimum", () => {
    const spans: BookingSpan[] = [{ startMinute: 600, endMinute: 660 }];

    expect(gridBounds(spans, [])).toEqual({ startMinute: 600, endMinute: 960 });
  });

  it("pushes a late-evening window up off the midnight ceiling", () => {
    // 22:00–23:00 alone: extending downwards would run past midnight, so the
    // end pins to 1440 and the start comes up to meet the six-hour minimum.
    const spans: BookingSpan[] = [{ startMinute: 1320, endMinute: 1380 }];

    expect(gridBounds(spans, [])).toEqual({ startMinute: 1080, endMinute: 1440 });
  });

  it("clamps to the day rather than producing an out-of-range axis", () => {
    const spans: BookingSpan[] = [{ startMinute: 0, endMinute: 1440 }];

    expect(gridBounds(spans, [])).toEqual({ startMinute: 0, endMinute: 1440 });
  });

  it("takes the widest of several working-hours rows", () => {
    const workingHours = [
      hours(1, 10 * 60, 16 * 60),
      hours(2, 8 * 60, 18 * 60),
      hours(3, 9 * 60, 20 * 60),
    ];

    expect(gridBounds([], workingHours)).toEqual({
      startMinute: 480,
      endMinute: 1200,
    });
  });

  it("uses working hours alone when there are no bookings", () => {
    expect(gridBounds([], [hours(TUESDAY_DOW, 11 * 60, 13 * 60)])).toEqual({
      // 11:00–13:00 is two hours, so it widens to the six-hour minimum.
      startMinute: 660,
      endMinute: 1020,
    });
  });
});

// ---------------------------------------------------------------------------
// assignLanes
// ---------------------------------------------------------------------------

type LaneInput = BookingSpan & { booking: DashboardBooking };

function span(id: string, startMinute: number, endMinute: number): LaneInput {
  return {
    startMinute,
    endMinute,
    booking: at(TUESDAY, "09:00", "09:30", { id }),
  };
}

function placed(
  result: ReturnType<typeof assignLanes>,
  id: string,
): { lane: number; laneCount: number } {
  const hit = result.find((r) => r.booking.id === id);
  if (!hit) throw new Error(`assignLanes dropped booking ${id}`);
  return { lane: hit.lane, laneCount: hit.laneCount };
}

describe("assignLanes", () => {
  it("returns nothing for an empty column", () => {
    expect(assignLanes([])).toEqual([]);
  });

  it("puts a lone booking in the only lane there is", () => {
    expect(placed(assignLanes([span("a", 540, 600)]), "a")).toEqual({
      lane: 0,
      laneCount: 1,
    });
  });

  it("keeps sequential bookings in one full-width lane", () => {
    const result = assignLanes([span("a", 540, 600), span("b", 660, 720)]);

    expect(placed(result, "a")).toEqual({ lane: 0, laneCount: 1 });
    expect(placed(result, "b")).toEqual({ lane: 0, laneCount: 1 });
  });

  it("treats back-to-back bookings as touching, not overlapping", () => {
    // The boundary: a.endMinute === b.startMinute. Half-open, exactly like the
    // tsrange the exclusion constraint uses — otherwise every ordinary
    // back-to-back day would render at half width.
    const result = assignLanes([span("a", 540, 600), span("b", 600, 660)]);

    expect(placed(result, "a")).toEqual({ lane: 0, laneCount: 1 });
    expect(placed(result, "b")).toEqual({ lane: 0, laneCount: 1 });
  });

  it("splits two genuinely overlapping bookings into distinct lanes", () => {
    const result = assignLanes([span("a", 540, 600), span("b", 570, 630)]);

    expect(placed(result, "a")).toEqual({ lane: 0, laneCount: 2 });
    expect(placed(result, "b")).toEqual({ lane: 1, laneCount: 2 });
  });

  it("counts lanes per cluster, not per column", () => {
    // The easy-to-get-wrong one. The 17:00 booking shares the column with a
    // 2-way overlap in the morning but overlaps nothing itself — if laneCount
    // were a column-wide number it would render at half width with dead space
    // beside it for the rest of the afternoon.
    const result = assignLanes([
      span("morning-a", 540, 600),
      span("morning-b", 570, 630),
      span("afternoon", 1020, 1080),
    ]);

    expect(placed(result, "morning-a").laneCount).toBe(2);
    expect(placed(result, "morning-b").laneCount).toBe(2);
    expect(placed(result, "afternoon")).toEqual({ lane: 0, laneCount: 1 });
  });

  it("gives three mutually overlapping bookings three lanes", () => {
    const result = assignLanes([
      span("a", 540, 600),
      span("b", 550, 610),
      span("c", 560, 620),
    ]);

    expect(placed(result, "a")).toEqual({ lane: 0, laneCount: 3 });
    expect(placed(result, "b")).toEqual({ lane: 1, laneCount: 3 });
    expect(placed(result, "c")).toEqual({ lane: 2, laneCount: 3 });
  });

  it("lets a staircase reuse a freed lane instead of growing a third", () => {
    // A 09:00–10:00, B 09:30–10:30, C 10:00–11:00. A and C only touch, so C
    // belongs back in A's lane and the cluster needs two lanes, not three.
    const result = assignLanes([
      span("a", 540, 600),
      span("b", 570, 630),
      span("c", 600, 660),
    ]);

    expect(placed(result, "a")).toEqual({ lane: 0, laneCount: 2 });
    expect(placed(result, "b")).toEqual({ lane: 1, laneCount: 2 });
    expect(placed(result, "c")).toEqual({ lane: 0, laneCount: 2 });
  });

  it("does not depend on the order the bookings arrive in", () => {
    const items = [span("a", 540, 600), span("b", 570, 630), span("c", 600, 660)];
    const shuffled = [items[2], items[0], items[1]];

    const inOrder = assignLanes(items);
    const outOfOrder = assignLanes(shuffled);

    for (const id of ["a", "b", "c"]) {
      expect(placed(outOfOrder, id), `lane assignment for ${id}`).toEqual(
        placed(inOrder, id),
      );
    }
  });

  it("keeps a booking fully contained inside another out of its lane", () => {
    const result = assignLanes([span("long", 540, 720), span("short", 600, 630)]);

    expect(placed(result, "long")).toEqual({ lane: 0, laneCount: 2 });
    expect(placed(result, "short")).toEqual({ lane: 1, laneCount: 2 });
  });

  it("preserves the span it was given", () => {
    const result = assignLanes([span("a", 540, 600)]);

    expect(result[0].startMinute).toBe(540);
    expect(result[0].endMinute).toBe(600);
  });

  it("returns every booking it was given", () => {
    const result = assignLanes([
      span("a", 540, 600),
      span("b", 570, 630),
      span("c", 1020, 1080),
    ]);

    expect(result.map((r) => r.booking.id).sort()).toEqual(["a", "b", "c"]);
  });
});

// ---------------------------------------------------------------------------
// buildDayGrid
// ---------------------------------------------------------------------------

describe("buildDayGrid", () => {
  const marco = staffMember(MARCO.id, MARCO.name);
  const ivan = staffMember(IVAN.id, IVAN.name);
  const removed = staffMember(GONE.id, GONE.name, false);

  function dayGrid(
    bookings: DashboardBooking[],
    staff: CalendarStaff[],
    workingHours: WorkingHoursRow[] = [hours(TUESDAY_DOW, 8 * 60, 18 * 60)],
  ) {
    return buildDayGrid({
      bookings,
      staff,
      workingHours,
      timezone: TZ,
      locale: "en",
      vertical: "BARBERSHOP",
    });
  }

  it("gives every active barber a column, even an empty one", () => {
    const grid = dayGrid([at(TUESDAY, "10:00", "10:30")], [marco, ivan]);

    expect(grid.columns.map((c) => c.label)).toEqual([MARCO.name, IVAN.name]);
    expect(grid.columns[1].bookings).toEqual([]);
  });

  it("keys columns by staff id so two barbers of the same name stay apart", () => {
    const grid = dayGrid([], [marco, ivan]);

    expect(grid.columns.map((c) => c.key)).toEqual([MARCO.id, IVAN.id]);
  });

  it("marks an active barber's column as ordinary", () => {
    const grid = dayGrid([], [marco]);

    expect(grid.columns[0].muted).toBe(false);
    expect(grid.columns[0].sublabel).toBeNull();
    expect(grid.columns[0].highlight).toBe(false);
  });

  it("still shows a soft-deleted barber who has bookings that day", () => {
    // There is no hard delete for Staff — "removing" a barber sets active
    // false. Their existing appointments are still real appointments the owner
    // has to work, so dropping the column would erase them from the calendar.
    const grid = dayGrid(
      [at(TUESDAY, "10:00", "10:30", { staff: GONE })],
      [marco, removed],
    );

    const column = grid.columns.find((c) => c.key === GONE.id);

    expect(column).toBeDefined();
    expect(column?.muted).toBe(true);
    expect(column?.sublabel).toBe("No longer here");
    expect(column?.bookings).toHaveLength(1);
  });

  it("omits a soft-deleted barber with nothing on the books that day", () => {
    // The other half of the same rule: once their last booking is behind them,
    // a removed barber must stop taking up a column forever.
    const grid = dayGrid([at(TUESDAY, "10:00", "10:30")], [marco, removed]);

    expect(grid.columns.map((c) => c.key)).toEqual([MARCO.id]);
  });

  it("keeps a booking whose barber is missing from the staff list, in a column of its own", () => {
    // Defensive: this shouldn't happen, but silently dropping an appointment is
    // the worst possible failure mode for a calendar.
    const stranger = { id: "staff-ghost", name: "Ana Unknown" };
    const grid = dayGrid(
      [
        at(TUESDAY, "10:00", "10:30"),
        at(TUESDAY, "11:00", "11:30", { staff: stranger }),
      ],
      [marco, ivan],
    );

    const last = grid.columns.at(-1);

    expect(grid.columns).toHaveLength(3);
    expect(last?.label).toBe("Ana Unknown");
    expect(last?.sublabel).toBe("Unknown barber");
    expect(last?.muted).toBe(true);
    expect(last?.bookings).toHaveLength(1);
  });

  it("files each booking under its own barber", () => {
    const grid = dayGrid(
      [
        at(TUESDAY, "10:00", "10:30", { id: "m1" }),
        at(TUESDAY, "10:00", "10:30", { id: "i1", staff: IVAN }),
      ],
      [marco, ivan],
    );

    expect(grid.columns[0].bookings.map((b) => b.booking.id)).toEqual(["m1"]);
    expect(grid.columns[1].bookings.map((b) => b.booking.id)).toEqual(["i1"]);
  });

  it("lays out hour marks inclusively from the first hour to the last", () => {
    const grid = dayGrid([], [marco]);

    expect(grid.startMinute).toBe(480);
    expect(grid.endMinute).toBe(1080);
    // 08:00 through 18:00 inclusive.
    expect(grid.hourMarks).toHaveLength(11);
    expect(grid.hourMarks[0]).toEqual({
      minute: 480,
      label: "08:00",
      topPercent: 0,
    });
    expect(grid.hourMarks.at(-1)).toEqual({
      minute: 1080,
      label: "18:00",
      topPercent: 100,
    });
  });

  it("zero-pads the hour label to 24-hour form", () => {
    const grid = dayGrid([], [marco], [hours(TUESDAY_DOW, 9 * 60, 15 * 60)]);

    expect(grid.hourMarks.map((m) => m.label)).toEqual([
      "09:00",
      "10:00",
      "11:00",
      "12:00",
      "13:00",
      "14:00",
      "15:00",
    ]);
  });

  it("places a booking at the percentage its wall clock earns", () => {
    // Axis is 08:00–18:00 = 600 minutes. A 09:00–10:00 booking sits 60 minutes
    // in and is 60 minutes long: 10% down, 10% tall.
    const grid = dayGrid([at(TUESDAY, "09:00", "10:00")], [marco]);
    const [placedBooking] = grid.columns[0].bookings;

    expect(placedBooking.startMinute).toBe(540);
    expect(placedBooking.endMinute).toBe(600);
    expect(placedBooking.topPercent).toBeCloseTo(10, 9);
    expect(placedBooking.heightPercent).toBeCloseTo(10, 9);
  });

  it("never lets a booking overflow the bottom of the axis", () => {
    const grid = dayGrid(
      [
        at(TUESDAY, "08:00", "08:30"),
        at(TUESDAY, "12:00", "13:00"),
        at(TUESDAY, "17:00", "18:00"),
      ],
      [marco],
    );

    for (const b of grid.columns[0].bookings) {
      expect(b.topPercent + b.heightPercent).toBeLessThanOrEqual(100 + 1e-9);
    }
    // The last one ends exactly on the axis floor.
    expect(grid.columns[0].bookings.at(-1)?.topPercent).toBeCloseTo(90, 9);
    expect(grid.columns[0].bookings.at(-1)?.heightPercent).toBeCloseTo(10, 9);
  });

  it("widens the axis for a booking outside the shift", () => {
    const grid = dayGrid([at(TUESDAY, "07:15", "07:45")], [marco]);

    expect(grid.startMinute).toBe(420);
    expect(grid.endMinute).toBe(1080);
    // Axis 07:00–18:00 = 660 minutes; the walk-in starts 15 minutes in.
    expect(grid.columns[0].bookings[0].topPercent).toBeCloseTo((15 / 660) * 100, 9);
    expect(grid.columns[0].bookings[0].heightPercent).toBeCloseTo(
      (30 / 660) * 100,
      9,
    );
  });

  it("returns a usable empty grid for a shop with no staff at all", () => {
    const grid = buildDayGrid({
      bookings: [],
      staff: [],
      workingHours: [],
      timezone: TZ,
      locale: "en",
      vertical: "BARBERSHOP",
    });

    expect(grid.columns).toEqual([]);
    expect(grid.startMinute).toBe(480);
    expect(grid.endMinute).toBe(1200);
    expect(grid.hourMarks).toHaveLength(13);
  });

  it("gives simultaneous bookings for one barber distinct lanes", () => {
    // Double-booking shouldn't be possible, but the exclusion constraint only
    // covers occupying statuses — a cancellation can legitimately sit on top of
    // the booking that replaced it.
    const grid = dayGrid(
      [
        at(TUESDAY, "10:00", "11:00", { id: "kept" }),
        at(TUESDAY, "10:30", "11:30", { id: "cancelled", status: "CANCELLED" }),
      ],
      [marco],
    );

    const lanes = grid.columns[0].bookings.map((b) => b.lane).sort();

    expect(lanes).toEqual([0, 1]);
    expect(grid.columns[0].bookings.every((b) => b.laneCount === 2)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// buildWeekGrid
// ---------------------------------------------------------------------------

describe("buildWeekGrid", () => {
  /** Monday-first week containing Tuesday 2026-07-28. */
  const WEEK = [
    "2026-07-27",
    "2026-07-28",
    "2026-07-29",
    "2026-07-30",
    "2026-07-31",
    "2026-08-01",
    "2026-08-02",
  ];

  function weekGrid(
    bookings: DashboardBooking[],
    opts: { dates?: string[]; now?: Date; workingHours?: WorkingHoursRow[] } = {},
  ) {
    return buildWeekGrid({
      bookings,
      dates: opts.dates ?? WEEK,
      workingHours: opts.workingHours ?? WIDE_WEEK,
      timezone: TZ,
      locale: "en",
      now: opts.now ?? local(TUESDAY, "12:00"),
    });
  }

  it("gives one column per date, in the order asked for", () => {
    const grid = weekGrid([]);

    expect(grid.columns.map((c) => c.key)).toEqual(WEEK);
  });

  it("labels a column with the weekday and the unpadded day of month", () => {
    const grid = weekGrid([]);

    expect(grid.columns[0].label).toBe("Mon");
    expect(grid.columns[0].sublabel).toBe("27");
    expect(grid.columns[1].label).toBe("Tue");
    expect(grid.columns[1].sublabel).toBe("28");
    expect(grid.columns[6].label).toBe("Sun");
    expect(grid.columns[6].sublabel).toBe("2");
  });

  it("highlights exactly the column that contains now", () => {
    const grid = weekGrid([]);

    expect(grid.columns.filter((c) => c.highlight).map((c) => c.key)).toEqual([
      TUESDAY,
    ]);
  });

  it("decides today from the tenant's clock, not UTC", () => {
    // 22:30 UTC on Monday 27 July is 00:30 Berlin on Tuesday the 28th. A UTC
    // reading would light up the wrong column for half an hour every night.
    const grid = weekGrid([], { now: utc("2026-07-27T22:30:00") });

    expect(grid.columns.filter((c) => c.highlight).map((c) => c.key)).toEqual([
      TUESDAY,
    ]);
  });

  it("highlights nothing when now is outside the week on show", () => {
    const grid = weekGrid([], { now: local("2026-09-14", "12:00") });

    expect(grid.columns.some((c) => c.highlight)).toBe(false);
  });

  it("groups a booking by its tenant-local date, not its UTC date", () => {
    // 23:30 UTC on 27 July is 01:30 Berlin on the 28th — it belongs to Tuesday.
    const grid = weekGrid([
      booking(utc("2026-07-27T23:30:00"), utc("2026-07-28T00:15:00"), {
        id: "after-midnight",
      }),
    ]);

    expect(grid.columns[0].bookings).toEqual([]);
    expect(grid.columns[1].bookings.map((b) => b.booking.id)).toEqual([
      "after-midnight",
    ]);
  });

  it("merges every barber into one column per day", () => {
    const grid = weekGrid([
      at(TUESDAY, "10:00", "10:30", { id: "m1" }),
      at(TUESDAY, "14:00", "14:30", { id: "i1", staff: IVAN }),
    ]);

    expect(grid.columns[1].bookings.map((b) => b.booking.id).sort()).toEqual([
      "i1",
      "m1",
    ]);
  });

  it("gives two barbers booked at the same time distinct lanes", () => {
    // In the week view this is the normal case, not a double-booking: the whole
    // shop shares one column per day.
    const grid = weekGrid([
      at(TUESDAY, "10:00", "11:00", { id: "m1" }),
      at(TUESDAY, "10:00", "11:00", { id: "i1", staff: IVAN }),
    ]);

    const lanes = grid.columns[1].bookings.map((b) => b.lane).sort();

    expect(lanes).toEqual([0, 1]);
    expect(grid.columns[1].bookings.every((b) => b.laneCount === 2)).toBe(true);
  });

  it("shares one axis across the whole week", () => {
    // A late Friday booking must move Monday's axis too, or the two columns
    // draw the same hour at different heights and the week reads as nonsense.
    const grid = weekGrid([
      at("2026-07-27", "09:00", "10:00", { id: "mon" }),
      at("2026-07-31", "21:00", "22:00", { id: "fri" }),
    ]);

    expect(grid.startMinute).toBe(480);
    expect(grid.endMinute).toBe(1320);

    // Monday's 09:00–10:00 measured against the shared 840-minute axis:
    // top (540-480)/840 = 7.142857%, height 60/840 = 7.142857%.
    const mon = grid.columns[0].bookings[0];
    expect(mon.topPercent).toBeCloseTo((60 / 840) * 100, 9);
    expect(mon.heightPercent).toBeCloseTo((60 / 840) * 100, 9);
    // ...which is emphatically not what a per-column axis would have produced.
    expect(mon.heightPercent).not.toBeCloseTo((60 / 600) * 100, 3);
  });

  it("runs hour marks across the shared axis", () => {
    const grid = weekGrid([]);

    expect(grid.hourMarks[0].label).toBe("08:00");
    expect(grid.hourMarks[0].topPercent).toBe(0);
    expect(grid.hourMarks.at(-1)?.label).toBe("18:00");
    expect(grid.hourMarks.at(-1)?.topPercent).toBe(100);
  });

  it("still draws every day of an empty week", () => {
    const grid = weekGrid([], { workingHours: [] });

    expect(grid.columns).toHaveLength(7);
    expect(grid.columns.every((c) => c.bookings.length === 0)).toBe(true);
    expect(grid.startMinute).toBe(480);
    expect(grid.endMinute).toBe(1200);
  });

  it("drops a booking that falls outside the dates on show rather than misfiling it", () => {
    const grid = weekGrid([at("2026-08-10", "10:00", "10:30", { id: "next-month" })]);

    expect(grid.columns.flatMap((c) => c.bookings)).toEqual([]);
  });

  it("marks week columns as ordinary, not muted", () => {
    const grid = weekGrid([]);

    expect(grid.columns.every((c) => c.muted === false)).toBe(true);
  });

  // Tuesday to Saturday, the usual barbershop week: Sunday (0) and Monday (1)
  // have no rows.
  const TUE_TO_SAT = [2, 3, 4, 5, 6].map((d) => hours(d));

  it("marks a day nobody works as closed", () => {
    const grid = weekGrid([], { workingHours: TUE_TO_SAT });

    expect(grid.columns.filter((c) => c.closed).map((c) => c.key)).toEqual([
      "2026-07-27",
      "2026-08-02",
    ]);
  });

  it("keeps a day with no hours open when something is booked on it", () => {
    // A walk-in the owner entered on a Monday is a real appointment, and a
    // 3.5rem column has no room to draw it.
    const grid = weekGrid([at("2026-07-27", "10:00", "10:30", { id: "walk-in" })], {
      workingHours: TUE_TO_SAT,
    });

    expect(grid.columns[0].closed).toBe(false);
    expect(grid.columns[6].closed).toBe(true);
  });

  it("closes nothing when every day has hours", () => {
    const grid = weekGrid([]);

    expect(grid.columns.some((c) => c.closed)).toBe(false);
  });

  it("reads the weekday from the tenant's calendar, not UTC", () => {
    // Only Sunday (0) is worked. Were the weekday taken off a UTC reading or
    // Luxon's 7 = Sunday unconverted, Sunday would come out closed.
    const grid = weekGrid([], { workingHours: [hours(0)] });

    expect(grid.columns.filter((c) => !c.closed).map((c) => c.key)).toEqual([
      "2026-08-02",
    ]);
  });
});

// ---------------------------------------------------------------------------
// weekdaysOf
// ---------------------------------------------------------------------------

describe("weekdaysOf", () => {
  it("maps Sunday to 0 and Monday to 1, the schema's numbering", () => {
    // Luxon counts 1 = Monday .. 7 = Sunday; WorkingHours.dayOfWeek counts
    // 0 = Sunday .. 6 = Saturday. Getting this wrong shifts every barber's
    // shift by a day, which looks plausible enough to ship.
    expect(weekdaysOf(["2026-07-26"], TZ)).toEqual([0]);
    expect(weekdaysOf(["2026-07-27"], TZ)).toEqual([1]);
  });

  it("maps Saturday to 6", () => {
    expect(weekdaysOf(["2026-08-01"], TZ)).toEqual([6]);
  });

  it("collapses duplicates", () => {
    const days = weekdaysOf(["2026-07-27", "2026-08-03", "2026-07-27"], TZ);

    expect(days).toHaveLength(1);
    expect(days).toEqual([1]);
  });

  it("covers a whole Monday-first week exactly once", () => {
    const days = weekdaysOf(
      [
        "2026-07-27",
        "2026-07-28",
        "2026-07-29",
        "2026-07-30",
        "2026-07-31",
        "2026-08-01",
        "2026-08-02",
      ],
      TZ,
    );

    expect([...days].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it("returns nothing for no dates", () => {
    expect(weekdaysOf([], TZ)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Block density
//
// Added after a real bug: every block rendered the same three stacked lines
// regardless of its height, so a 20-minute booking overflowed its box and
// `overflow-hidden` clipped it through the middle of the second line. It read
// as garbled text rather than as truncation, and `truncate` on each line never
// applied — that is `ellipsis` + `nowrap`, purely horizontal.
//
// The tests below deliberately cover a spread of durations rather than the one
// that was reported. The failure was never specific to 20 minutes; it was
// specific to "shorter than three lines of text", and the only honest way to
// show it is fixed is to check the whole range.
// ---------------------------------------------------------------------------

/**
 * What each tier costs, in the units the CSS actually uses.
 *
 * Mirrors DENSITY_STYLES and the line classes in
 * components/dashboard/calendar-grid.tsx: `li` pb-px (1px) + the block's 1px
 * border top and bottom (2px) + that tier's vertical padding, against each
 * line's own height — its font size times the tier's leading (tight = 1.25,
 * none = 1). If someone changes a size or the padding in the component without
 * moving the thresholds in calendar-layout.ts, the fit assertion below fails.
 */
const TIER_METRICS: Record<
  BlockDensity,
  { chromePx: number; lineHeightsPx: number[] }
> = {
  // time 12px / customer 13px / service 12px
  full: { chromePx: 1 + 2 + 8, lineHeightsPx: [12 * 1.25, 13 * 1.25, 12 * 1.25] },
  // time + customer 13px / service 12px
  compact: { chromePx: 1 + 2 + 4, lineHeightsPx: [13 * 1.25, 12 * 1.25] },
  // time + customer, 13px leading-none
  minimal: { chromePx: 1 + 2 + 0, lineHeightsPx: [13] },
  // Renders no text, so it fits by construction at any height.
  sliver: { chromePx: 1 + 2 + 0, lineHeightsPx: [] },
};

/** Builds a one-booking day grid and returns the placed block. */
function blockOfDuration(minutes: number) {
  const startAt = local(TUESDAY, "10:00");
  const grid = buildDayGrid({
    bookings: [
      booking(startAt, new Date(startAt.getTime() + minutes * 60_000)),
    ],
    staff: [staffMember(MARCO.id, MARCO.name)],
    workingHours: [hours(TUESDAY_DOW)],
    timezone: TZ,
    locale: "en",
    vertical: "BARBERSHOP",
  });

  return grid.columns[0].bookings[0];
}

describe("blockDensity", () => {
  it("puts each tier boundary where the text stops fitting", () => {
    expect(blockDensity(58)).toBe("full");
    expect(blockDensity(57.9)).toBe("compact");
    expect(blockDensity(40)).toBe("compact");
    expect(blockDensity(39.9)).toBe("minimal");
    expect(blockDensity(16)).toBe("minimal");
    expect(blockDensity(15.9)).toBe("sliver");
    expect(blockDensity(0)).toBe("sliver");
  });
});

describe("block geometry across durations", () => {
  // 96px an hour, so height is duration and nothing else. The reported bug had
  // these depending on the shop's opening hours too, which is why a booking
  // could be legible for one tenant and garbled for another.
  //
  // The short end is the point of the 96: a 15-minute trim still carries its
  // customer's name, and a 30-minute cut its service too.
  it.each([
    [5, 8, "sliver"],
    [10, 16, "minimal"],
    [15, 24, "minimal"],
    [20, 32, "minimal"],
    [25, 40, "compact"],
    [30, 48, "compact"],
    [35, 56, "compact"],
    [40, 64, "full"],
    [45, 72, "full"],
    [60, 96, "full"],
    [90, 144, "full"],
  ])("a %i-minute booking is %fpx and renders %s", (minutes, px, density) => {
    const block = blockOfDuration(minutes as number);

    expect(block.heightPx).toBeCloseTo(px as number, 1);
    expect(block.density).toBe(density);
  });

  // The invariant that actually protects the fix. Every duration a shop could
  // plausibly sell, checked against the arithmetic that decides whether text
  // overflows its box. A tier that doesn't fit is the original bug returning.
  it.each(
    Array.from({ length: 24 }, (_, i) => (i + 1) * 5),
  )("fits its tier's text at %i minutes", (minutes) => {
    const block = blockOfDuration(minutes);
    const tier = TIER_METRICS[block.density];
    const contentPx = block.heightPx - tier.chromePx;
    const textPx = tier.lineHeightsPx.reduce((sum, line) => sum + line, 0);

    expect(
      contentPx,
      `${minutes}min -> ${block.heightPx.toFixed(1)}px, tier "${block.density}" needs ` +
        `${tier.lineHeightsPx.join(" + ")}px + ${tier.chromePx}px chrome`,
    ).toBeGreaterThanOrEqual(textPx);
  });

  it("scales an hour identically however long the shop's day is", () => {
    // The second half of the bug: with a fixed total grid height, a 9-hour shop
    // got 80px/hour and a 14-hour shop 51px/hour, so the same appointment was
    // readable for one tenant and clipped for another.
    const startAt = local(TUESDAY, "10:00");
    const thirtyMinutes = booking(
      startAt,
      new Date(startAt.getTime() + 30 * 60_000),
    );

    const heights = [
      [9 * 60, 18 * 60],
      [7 * 60, 21 * 60],
    ].map(([open, close]) => {
      const grid = buildDayGrid({
        bookings: [thirtyMinutes],
        staff: [staffMember(MARCO.id, MARCO.name)],
        workingHours: [hours(TUESDAY_DOW, open, close)],
        timezone: TZ,
        locale: "en",
        vertical: "BARBERSHOP",
      });

      return grid.columns[0].bookings[0];
    });

    expect(heights[0].heightPx).toBeCloseTo(heights[1].heightPx, 5);
    expect(heights[0].density).toBe(heights[1].density);
  });

  it("sizes the grid from the axis span so the percentages resolve", () => {
    const grid = buildDayGrid({
      bookings: [],
      staff: [staffMember(MARCO.id, MARCO.name)],
      workingHours: [hours(TUESDAY_DOW)],
      timezone: TZ,
      locale: "en",
      vertical: "BARBERSHOP",
    });

    // 09:00-18:00 is nine hours.
    expect(grid.heightPx).toBe(9 * CALENDAR_PX_PER_HOUR);
  });

  it("grows the axis for an appointment running past closing rather than cutting it", () => {
    // Worth pinning because the tier is derived from the *clamped* height, so
    // the obvious worry is a block truncated by the bottom of the grid being
    // handed more text than it has room for. It can't happen: gridBounds is
    // computed from these same spans and always widens to contain them, so the
    // clamp in `assemble` is unreachable through the public API and stays purely
    // defensive. If that ever stops being true, this is the test that says so.
    const grid = buildDayGrid({
      bookings: [booking(local(TUESDAY, "17:50"), local(TUESDAY, "18:50"))],
      staff: [staffMember(MARCO.id, MARCO.name)],
      workingHours: [hours(TUESDAY_DOW)],
      timezone: TZ,
      locale: "en",
      vertical: "BARBERSHOP",
    });

    const block = grid.columns[0].bookings[0];

    // 09:00–18:00 became 09:00–19:00 to cover the overrun.
    expect(grid.endMinute).toBe(19 * 60);
    expect(grid.heightPx).toBe(10 * CALENDAR_PX_PER_HOUR);
    expect(block.topPercent + block.heightPercent).toBeLessThanOrEqual(100);
    // A full hour, drawn at its full height — not squeezed by the boundary.
    expect(block.heightPx).toBeCloseTo(CALENDAR_PX_PER_HOUR, 5);
    expect(block.density).toBe("full");
  });
});

// ---------------------------------------------------------------------------
// groupByLocalDate
// ---------------------------------------------------------------------------

describe("groupByLocalDate", () => {
  it("buckets bookings under the tenant's day, not the UTC one", () => {
    // 23:30 UTC on the 27th is 01:30 Berlin on the 28th. The agenda and the week
    // grid must agree about which day that is, which is why they share this.
    const late = booking(utc("2026-07-27T23:30:00"), utc("2026-07-28T00:00:00"));
    const grouped = groupByLocalDate([late], TZ);

    expect([...grouped.keys()]).toEqual(["2026-07-28"]);
  });

  it("keeps each day's bookings in the order they arrived", () => {
    const first = at(TUESDAY, "09:00", "09:30", { id: "first" });
    const second = at(TUESDAY, "11:00", "11:30", { id: "second" });
    const grouped = groupByLocalDate([first, second], TZ);

    expect(grouped.get(TUESDAY)?.map((b) => b.id)).toEqual(["first", "second"]);
  });

  it("separates days and omits ones with nothing on them", () => {
    const grouped = groupByLocalDate(
      [at(TUESDAY, "09:00", "09:30"), at("2026-07-30", "10:00", "10:30")],
      TZ,
    );

    expect([...grouped.keys()]).toEqual([TUESDAY, "2026-07-30"]);
    expect(grouped.get("2026-07-29")).toBeUndefined();
  });

  it("returns nothing for no bookings", () => {
    expect(groupByLocalDate([], TZ).size).toBe(0);
  });
});
