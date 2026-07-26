import { DateTime } from "luxon";
import { describe, expect, it } from "vitest";

import {
  BOOKING_HORIZON_DAYS,
  canPageBack,
  canPageForward,
  dateStrip,
  findSlot,
  mergeStaffSlots,
  resolveBookingDate,
  shiftByWeek,
  todayInZone,
} from "./booking-options";
import type { StaffSlots } from "./slots";

const ZONE = "Europe/Berlin";

/** A UTC instant from a tenant-local wall clock, the way the app produces them. */
function at(local: string): Date {
  const parsed = DateTime.fromISO(local, { zone: ZONE });
  if (!parsed.isValid) throw new Error(`bad test input: ${local}`);
  return parsed.toJSDate();
}

function staff(staffId: string, locals: string[]): StaffSlots {
  return { staffId, slots: locals.map(at) };
}

/** Merged slots as "HH:mm -> id,id", which is what these tests are really about. */
function summarize(merged: ReturnType<typeof mergeStaffSlots>): string[] {
  return merged.map(
    (slot) =>
      `${DateTime.fromJSDate(slot.startAt).setZone(ZONE).toFormat("HH:mm")} -> ${slot.staffIds.join(",")}`,
  );
}

describe("mergeStaffSlots", () => {
  it("collapses a shared time into one slot backed by both barbers", () => {
    const merged = mergeStaffSlots([
      staff("marco", ["2026-07-28T14:30"]),
      staff("ivan", ["2026-07-28T14:30"]),
    ]);

    expect(summarize(merged)).toEqual(["14:30 -> marco,ivan"]);
  });

  it("preserves input order in staffIds, since that decides who gets booked", () => {
    const merged = mergeStaffSlots([
      staff("ivan", ["2026-07-28T14:30"]),
      staff("marco", ["2026-07-28T14:30"]),
    ]);

    // Reversed relative to the test above: the resolver takes staffIds[0], so
    // this ordering is behaviour, not an incidental detail.
    expect(merged[0].staffIds).toEqual(["ivan", "marco"]);
  });

  it("unions disjoint times and sorts them, rather than interleaving by staff", () => {
    const merged = mergeStaffSlots([
      staff("marco", ["2026-07-28T09:00", "2026-07-28T16:00"]),
      staff("ivan", ["2026-07-28T10:00"]),
    ]);

    expect(summarize(merged)).toEqual([
      "09:00 -> marco",
      "10:00 -> ivan",
      "16:00 -> marco",
    ]);
  });

  it("keeps a fully-booked barber from removing anyone else's times", () => {
    const merged = mergeStaffSlots([
      staff("marco", []),
      staff("ivan", ["2026-07-28T11:00"]),
    ]);

    expect(summarize(merged)).toEqual(["11:00 -> ivan"]);
  });

  it("returns nothing when every barber is fully booked", () => {
    expect(mergeStaffSlots([staff("marco", []), staff("ivan", [])])).toEqual([]);
  });

  it("returns nothing for no staff at all", () => {
    expect(mergeStaffSlots([])).toEqual([]);
  });

  it("dedupes by instant, not by Date identity", () => {
    // Two separately-constructed Dates for the same moment. Keying the map on
    // the objects instead of their epoch millis would produce two 14:30 slots.
    const merged = mergeStaffSlots([
      { staffId: "marco", slots: [new Date("2026-07-28T12:30:00.000Z")] },
      { staffId: "ivan", slots: [new Date("2026-07-28T12:30:00.000Z")] },
    ]);

    expect(merged).toHaveLength(1);
    expect(merged[0].staffIds).toEqual(["marco", "ivan"]);
  });
});

describe("findSlot", () => {
  const offered = mergeStaffSlots([
    staff("marco", ["2026-07-28T09:00", "2026-07-28T14:30"]),
    staff("ivan", ["2026-07-28T14:30"]),
  ]);

  it("matches an offered instant for a barber free at it", () => {
    const found = findSlot(offered, at("2026-07-28T14:30"), "ivan");

    expect(found?.staffIds).toEqual(["marco", "ivan"]);
  });

  it("compares by instant, not by Date identity", () => {
    // The action parses the instant out of a submitted ISO string, so the Date
    // it passes is never the same object the slot holds.
    const found = findSlot(
      offered,
      new Date("2026-07-28T12:30:00.000Z"),
      "marco",
    );

    expect(found).not.toBeNull();
  });

  it("rejects an instant nobody was offered", () => {
    expect(findSlot(offered, at("2026-07-28T14:45"), "marco")).toBeNull();
  });

  it("rejects a barber who is busy at an otherwise-open instant", () => {
    // 09:00 is a real slot, but only Marco is free then. Matching on the instant
    // alone would book Ivan into an appointment he already has.
    expect(findSlot(offered, at("2026-07-28T09:00"), "ivan")).toBeNull();
  });

  it("rejects a staff id that isn't in the list at all", () => {
    expect(findSlot(offered, at("2026-07-28T14:30"), "someone-else")).toBeNull();
  });

  it("rejects everything when nothing is offered", () => {
    expect(findSlot([], at("2026-07-28T14:30"), "marco")).toBeNull();
  });
});

describe("resolveBookingDate", () => {
  // 2026-07-28 10:00 Berlin time.
  const now = at("2026-07-28T10:00");

  it("defaults to today when the parameter is absent", () => {
    expect(resolveBookingDate(undefined, now, ZONE)).toBe("2026-07-28");
  });

  it("keeps a date inside the window", () => {
    expect(resolveBookingDate("2026-08-05", now, ZONE)).toBe("2026-08-05");
  });

  it("clamps a past date up to today rather than throwing", () => {
    expect(resolveBookingDate("1999-01-01", now, ZONE)).toBe("2026-07-28");
  });

  it("clamps beyond the horizon down to the last bookable day", () => {
    const horizon = DateTime.fromJSDate(now)
      .setZone(ZONE)
      .plus({ days: BOOKING_HORIZON_DAYS })
      .toISODate();

    expect(resolveBookingDate("2027-01-01", now, ZONE)).toBe(horizon);
  });

  it("falls back to today for unparseable input", () => {
    expect(resolveBookingDate("banana", now, ZONE)).toBe("2026-07-28");
    expect(resolveBookingDate("", now, ZONE)).toBe("2026-07-28");
  });

  it("resolves 'today' in the tenant's zone, not the server's", () => {
    // 23:30 UTC on the 27th is already the 28th in Berlin. A server reading its
    // own clock would offer a day that has already started for the shop.
    const lateUtc = new Date("2026-07-27T23:30:00.000Z");

    expect(todayInZone(lateUtc, ZONE)).toBe("2026-07-28");
    expect(resolveBookingDate(undefined, lateUtc, ZONE)).toBe("2026-07-28");
  });
});

describe("dateStrip", () => {
  const now = at("2026-07-28T10:00");

  it("starts at the selected day and runs seven days", () => {
    const strip = dateStrip("2026-07-28", now, ZONE);

    expect(strip.map((day) => day.date)).toEqual([
      "2026-07-28",
      "2026-07-29",
      "2026-07-30",
      "2026-07-31",
      "2026-08-01",
      "2026-08-02",
      "2026-08-03",
    ]);
  });

  it("marks exactly one day as today", () => {
    const strip = dateStrip("2026-07-28", now, ZONE);

    expect(strip.filter((day) => day.isToday).map((day) => day.date)).toEqual([
      "2026-07-28",
    ]);
  });

  it("marks days past the horizon as unbookable", () => {
    const nearHorizon = DateTime.fromJSDate(now)
      .setZone(ZONE)
      .plus({ days: BOOKING_HORIZON_DAYS - 2 })
      .toISODate() as string;

    const strip = dateStrip(nearHorizon, now, ZONE);

    expect(strip.map((day) => day.bookable)).toEqual([
      true,
      true,
      true,
      false,
      false,
      false,
      false,
    ]);
  });

  it("crosses spring-forward without repeating or skipping a day", () => {
    // Europe/Berlin springs forward on 2026-03-29. Adding fixed milliseconds
    // instead of calendar days would land twice on the same local date here.
    const march = at("2026-03-26T10:00");
    const strip = dateStrip("2026-03-27", march, ZONE);

    expect(strip.map((day) => day.date)).toEqual([
      "2026-03-27",
      "2026-03-28",
      "2026-03-29",
      "2026-03-30",
      "2026-03-31",
      "2026-04-01",
      "2026-04-02",
    ]);
  });

  it("crosses autumn fall-back without repeating a day", () => {
    // Berlin falls back on 2026-10-25 — a 25-hour local day.
    const october = at("2026-10-22T10:00");
    const strip = dateStrip("2026-10-23", october, ZONE);

    expect(strip.map((day) => day.date)).toEqual([
      "2026-10-23",
      "2026-10-24",
      "2026-10-25",
      "2026-10-26",
      "2026-10-27",
      "2026-10-28",
      "2026-10-29",
    ]);
  });
});

describe("week paging", () => {
  const now = at("2026-07-28T10:00");

  it("cannot page back from the week containing today", () => {
    expect(canPageBack("2026-07-28", now, ZONE)).toBe(false);
    expect(canPageBack("2026-08-04", now, ZONE)).toBe(true);
  });

  it("cannot page forward past the horizon", () => {
    const horizon = DateTime.fromJSDate(now)
      .setZone(ZONE)
      .plus({ days: BOOKING_HORIZON_DAYS })
      .toISODate() as string;

    expect(canPageForward("2026-07-28", now, ZONE)).toBe(true);
    expect(canPageForward(horizon, now, ZONE)).toBe(false);
  });

  it("clamps a backwards shift to today instead of the past", () => {
    expect(shiftByWeek("2026-07-30", -1, now, ZONE)).toBe("2026-07-28");
  });

  it("clamps a forwards shift to the horizon", () => {
    const horizon = DateTime.fromJSDate(now)
      .setZone(ZONE)
      .plus({ days: BOOKING_HORIZON_DAYS })
      .toISODate() as string;

    expect(shiftByWeek(horizon, 1, now, ZONE)).toBe(horizon);
  });

  it("moves a whole week when there is room", () => {
    expect(shiftByWeek("2026-07-28", 1, now, ZONE)).toBe("2026-08-04");
  });
});
