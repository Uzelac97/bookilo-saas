import { DateTime } from "luxon";
import { describe, expect, it } from "vitest";

import {
  computeSlots,
  localDayWindowUtc,
  type ComputeSlotsInput,
  type StaffAvailability,
} from "./slots";

const TZ = "Europe/Berlin";

// 2026-07-28 is a Tuesday -> dayOfWeek 2 in the schema's 0 = Sunday numbering.
const TUESDAY = "2026-07-28";
const TUESDAY_DOW = 2;
// 2026-07-26 is a Sunday, and no fixture below gives anyone Sunday hours.
const SUNDAY = "2026-07-26";

/** A UTC instant from a tenant-local wall clock time — how a fixture is written. */
function local(date: string, time: string, zone = TZ): Date {
  return DateTime.fromISO(`${date}T${time}`, { zone }).toJSDate();
}

/** Slots as tenant-local "HH:mm", which is how the assertions stay readable. */
function hhmm(slots: Date[], zone = TZ): string[] {
  return slots.map((slot) =>
    DateTime.fromJSDate(slot).setZone(zone).toFormat("HH:mm"),
  );
}

const NINE_TO_SIX = {
  dayOfWeek: TUESDAY_DOW,
  startMinute: 9 * 60,
  endMinute: 18 * 60,
};

function staff(overrides: Partial<StaffAvailability> = {}): StaffAvailability {
  return {
    staffId: "marco",
    workingHours: [NINE_TO_SIX],
    timeOff: [],
    bookings: [],
    ...overrides,
  };
}

function input(overrides: Partial<ComputeSlotsInput> = {}): ComputeSlotsInput {
  return {
    date: TUESDAY,
    serviceDurationMinutes: 30,
    rules: { timezone: TZ, bufferMinutes: 0, minLeadMinutes: 60 },
    staff: [staff()],
    // Well before the day under test, so lead time never interferes unless a
    // test deliberately moves it.
    now: local("2026-07-01", "12:00"),
    ...overrides,
  };
}

/** Convenience for the single-staff cases. */
function slotsOf(overrides: Partial<ComputeSlotsInput> = {}): string[] {
  return hhmm(computeSlots(input(overrides))[0].slots);
}

describe("computeSlots — grid and boundaries", () => {
  it("offers the whole shift on a 15-minute grid when nothing is booked", () => {
    const slots = slotsOf();

    expect(slots[0]).toBe("09:00");
    expect(slots.slice(0, 5)).toEqual([
      "09:00",
      "09:15",
      "09:30",
      "09:45",
      "10:00",
    ]);
    // 09:00 through 17:30 inclusive, every 15 minutes.
    expect(slots).toHaveLength(35);
  });

  it("offers a service that ends exactly at closing, but not one that runs over", () => {
    const slots = slotsOf();

    // 17:30 + 30min lands exactly on the 18:00 close.
    expect(slots.at(-1)).toBe("17:30");
    expect(slots).not.toContain("17:45");
  });

  it("does not require the buffer to fit inside the shift", () => {
    // The buffer is cleanup time, not service time. A 30-minute cut ending
    // exactly at close is a legal last appointment even with a buffer that
    // notionally runs past it — requiring it to fit would silently delete the
    // last slot of every day.
    const slots = slotsOf({
      rules: { timezone: TZ, bufferMinutes: 15, minLeadMinutes: 60 },
    });

    expect(slots.at(-1)).toBe("17:30");
  });

  it("respects the service duration when placing the last slot", () => {
    const slots = slotsOf({ serviceDurationMinutes: 45 });

    expect(slots.at(-1)).toBe("17:15");
  });
});

describe("computeSlots — agreement with the exclusion constraint", () => {
  // These mirror the phases in scripts/probe-exclusion-constraint.ts. If one of
  // them disagrees with the database, the UI offers a slot the insert rejects.

  it("allows a genuinely back-to-back start when the buffer is zero (probe B)", () => {
    const booked = staff({
      bookings: [
        { startAt: local(TUESDAY, "10:00"), blockedUntil: local(TUESDAY, "10:30") },
      ],
    });
    const slots = hhmm(computeSlots(input({ staff: [booked] }))[0].slots);

    // tsrange is half-open, so adjacency in both directions stays legal.
    expect(slots).toContain("10:30");
    expect(slots).toContain("09:30");
  });

  it("blocks the adjacent start when the booking carries a 15-minute buffer (probe C)", () => {
    const booked = staff({
      bookings: [
        // Created under buffer 15: endAt 10:30, blockedUntil 10:45.
        { startAt: local(TUESDAY, "10:00"), blockedUntil: local(TUESDAY, "10:45") },
      ],
    });
    const slots = hhmm(
      computeSlots(
        input({
          staff: [booked],
          rules: { timezone: TZ, bufferMinutes: 15, minLeadMinutes: 60 },
        }),
      )[0].slots,
    );

    expect(slots).not.toContain("10:30");
    expect(slots).toContain("10:45");
  });

  it("removes exactly the candidates an existing booking overlaps, and no others", () => {
    const booked = staff({
      bookings: [
        { startAt: local(TUESDAY, "10:00"), blockedUntil: local(TUESDAY, "10:30") },
      ],
    });
    const slots = hhmm(computeSlots(input({ staff: [booked] }))[0].slots);

    // A 30-minute service starting at 09:45/10:00/10:15 would run into the
    // booking; 09:30 ends exactly as it begins.
    expect(slots).not.toContain("09:45");
    expect(slots).not.toContain("10:00");
    expect(slots).not.toContain("10:15");
    expect(slots).toContain("09:30");
    expect(slots).toContain("10:30");
    expect(slots).toHaveLength(32);
  });

  it("treats every booking it is given as occupying, whatever its status was", () => {
    // The pure function does not filter by status — lib/db/availability.ts owns
    // that decision, because the CONFIRMED/COMPLETED set has to stay identical
    // to the constraint's WHERE clause. A COMPLETED booking arrives here like
    // any other and must still block (probe F); a CANCELLED one simply never
    // arrives, which is what frees its slot (probe E).
    const completed = staff({
      bookings: [
        { startAt: local(TUESDAY, "14:00"), blockedUntil: local(TUESDAY, "14:30") },
      ],
    });

    expect(hhmm(computeSlots(input({ staff: [completed] }))[0].slots)).not.toContain(
      "14:00",
    );
    // Same day with the booking absent — the slot is open again.
    expect(slotsOf()).toContain("14:00");
  });

  it("uses the current buffer for the candidate and the stored one for existing bookings", () => {
    // createBooking snapshots blockedUntil and never recomputes it, so an old
    // booking keeps the buffer it was made under while a new one gets today's.
    const booked = staff({
      bookings: [
        // Made when the buffer was 0.
        { startAt: local(TUESDAY, "11:00"), blockedUntil: local(TUESDAY, "11:30") },
      ],
    });
    const slots = hhmm(
      computeSlots(
        input({
          staff: [booked],
          // Buffer has since been raised to 30.
          rules: { timezone: TZ, bufferMinutes: 30, minLeadMinutes: 60 },
        }),
      )[0].slots,
    );

    // The existing booking still only blocks to 11:30, so 11:30 is bookable...
    expect(slots).toContain("11:30");
    // ...but the new candidate at 10:30 now blocks through 11:30 and collides.
    expect(slots).not.toContain("10:30");
  });
});

describe("computeSlots — booking rules", () => {
  it("drops slots inside the minimum lead time", () => {
    const slots = slotsOf({ now: local(TUESDAY, "09:00") });

    expect(slots).not.toContain("09:00");
    expect(slots).not.toContain("09:45");
    expect(slots[0]).toBe("10:00");
  });

  it("offers the whole day when the lead time is zero and now is midnight", () => {
    const slots = slotsOf({
      now: local(TUESDAY, "00:00"),
      rules: { timezone: TZ, bufferMinutes: 0, minLeadMinutes: 0 },
    });

    expect(slots[0]).toBe("09:00");
  });

  it("removes exactly the range covered by time off", () => {
    const away = staff({
      timeOff: [
        { startAt: local(TUESDAY, "12:00"), endAt: local(TUESDAY, "13:00") },
      ],
    });
    const slots = hhmm(computeSlots(input({ staff: [away] }))[0].slots);

    expect(slots).toContain("11:30");
    expect(slots).not.toContain("11:45");
    expect(slots).not.toContain("12:00");
    expect(slots).not.toContain("12:45");
    expect(slots).toContain("13:00");
  });

  it("catches multi-day time off that spans the whole day", () => {
    const onHoliday = staff({
      timeOff: [
        { startAt: local("2026-07-27", "00:00"), endAt: local("2026-07-30", "00:00") },
      ],
    });

    expect(computeSlots(input({ staff: [onHoliday] }))[0].slots).toEqual([]);
  });

  it("returns nothing on a day with no working hours — this is how 'closed' works", () => {
    // There is no business-level hours field; a closed Sunday is simply the
    // absence of a WorkingHours row.
    expect(slotsOf({ date: SUNDAY })).toEqual([]);
  });

  it("honours a split shift as two windows with a real gap", () => {
    const splitShift = staff({
      workingHours: [
        { dayOfWeek: TUESDAY_DOW, startMinute: 9 * 60, endMinute: 12 * 60 },
        { dayOfWeek: TUESDAY_DOW, startMinute: 14 * 60, endMinute: 18 * 60 },
      ],
    });
    const slots = hhmm(computeSlots(input({ staff: [splitShift] }))[0].slots);

    expect(slots).toContain("11:30");
    expect(slots).not.toContain("11:45");
    expect(slots).not.toContain("12:00");
    expect(slots).not.toContain("13:30");
    expect(slots).toContain("14:00");
    expect(slots.at(-1)).toBe("17:30");
  });

  it("returns slots in chronological order regardless of working-hours row order", () => {
    const reversed = staff({
      workingHours: [
        { dayOfWeek: TUESDAY_DOW, startMinute: 14 * 60, endMinute: 18 * 60 },
        { dayOfWeek: TUESDAY_DOW, startMinute: 9 * 60, endMinute: 12 * 60 },
      ],
    });
    const slots = hhmm(computeSlots(input({ staff: [reversed] }))[0].slots);

    expect(slots[0]).toBe("09:00");
    expect([...slots]).toEqual([...slots].sort());
  });
});

describe("computeSlots — timezones and DST", () => {
  // 2026-03-29 (spring forward) and 2026-10-25 (fall back) are both Sundays in
  // Europe/Berlin, so these fixtures define Sunday hours explicitly.
  const SUNDAY_DOW = 0;
  const sundayStaff = staff({
    workingHours: [{ dayOfWeek: SUNDAY_DOW, startMinute: 9 * 60, endMinute: 18 * 60 }],
  });
  // These dates straddle the whole year, so `now` has to sit before all of them
  // or the lead-time filter empties the earlier ones.
  const BEFORE_ALL = local("2026-01-01", "00:00");

  it("keeps 09:00 local meaning 09:00 across the spring-forward boundary", () => {
    // The regression this exists for: building the window with
    // plus({ minutes: 540 }) adds nine *elapsed* hours to local midnight and
    // lands on 10:00 wall clock, because the clock jumped at 02:00.
    const result = computeSlots(
      input({ date: "2026-03-29", staff: [sundayStaff], now: BEFORE_ALL }),
    );

    expect(hhmm(result[0].slots)[0]).toBe("09:00");
    // 09:00 CEST (UTC+2).
    expect(result[0].slots[0].toISOString()).toBe("2026-03-29T07:00:00.000Z");
  });

  it("keeps 09:00 local meaning 09:00 across the fall-back boundary", () => {
    const result = computeSlots(
      input({ date: "2026-10-25", staff: [sundayStaff], now: BEFORE_ALL }),
    );

    expect(hhmm(result[0].slots)[0]).toBe("09:00");
    // 09:00 CET (UTC+1).
    expect(result[0].slots[0].toISOString()).toBe("2026-10-25T08:00:00.000Z");
    // The transition is at 03:00, before opening, so the shift is still 9 hours.
    expect(result[0].slots).toHaveLength(35);
  });

  it("maps the same wall clock to different instants in winter and summer", () => {
    const winter = computeSlots(
      input({ date: "2026-03-22", staff: [sundayStaff], now: BEFORE_ALL }),
    );
    const summer = computeSlots(
      input({ date: "2026-07-05", staff: [sundayStaff], now: BEFORE_ALL }),
    );

    expect(winter[0].slots[0].toISOString()).toBe("2026-03-22T08:00:00.000Z");
    expect(summer[0].slots[0].toISOString()).toBe("2026-07-05T07:00:00.000Z");
  });

  it("resolves the weekday in the tenant's zone, not UTC", () => {
    // 2026-07-28T00:30 Berlin is still 2026-07-27T22:30 UTC — a naive UTC
    // weekday would read Monday and hand back the wrong shift.
    const slots = slotsOf({ now: local(TUESDAY, "00:30") });

    expect(slots[0]).toBe("09:00");
  });
});

describe("computeSlots — multiple staff", () => {
  it("computes each barber independently and preserves input order", () => {
    const marco = staff({
      staffId: "marco",
      bookings: [
        { startAt: local(TUESDAY, "09:00"), blockedUntil: local(TUESDAY, "09:30") },
      ],
    });
    const ivan = staff({ staffId: "ivan" });

    const result = computeSlots(input({ staff: [marco, ivan] }));

    expect(result.map((r) => r.staffId)).toEqual(["marco", "ivan"]);
    expect(hhmm(result[0].slots)).not.toContain("09:00");
    expect(hhmm(result[1].slots)).toContain("09:00");
  });

  it("returns an empty list rather than dropping a fully unavailable barber", () => {
    const marco = staff({ staffId: "marco" });
    const ivan = staff({ staffId: "ivan", workingHours: [] });

    const result = computeSlots(input({ staff: [marco, ivan] }));

    expect(result).toHaveLength(2);
    expect(result[1]).toEqual({ staffId: "ivan", slots: [] });
  });

  it("returns an empty array when the tenant has no staff at all", () => {
    expect(computeSlots(input({ staff: [] }))).toEqual([]);
  });
});

describe("computeSlots — malformed input", () => {
  it("rejects an unparseable date", () => {
    expect(() => computeSlots(input({ date: "not-a-date" }))).toThrow(
      /invalid date/,
    );
  });

  it("rejects a non-positive service duration", () => {
    expect(() => computeSlots(input({ serviceDurationMinutes: 0 }))).toThrow(
      /must be positive/,
    );
  });

  it("ignores a working-hours row that does not describe a usable window", () => {
    const broken = staff({
      workingHours: [
        { dayOfWeek: TUESDAY_DOW, startMinute: 18 * 60, endMinute: 9 * 60 },
      ],
    });

    expect(computeSlots(input({ staff: [broken] }))[0].slots).toEqual([]);
  });

  it("handles a shift that closes at midnight", () => {
    const lateShift = staff({
      workingHours: [
        { dayOfWeek: TUESDAY_DOW, startMinute: 22 * 60, endMinute: 24 * 60 },
      ],
    });
    const slots = hhmm(computeSlots(input({ staff: [lateShift] }))[0].slots);

    expect(slots[0]).toBe("22:00");
    expect(slots.at(-1)).toBe("23:30");
  });
});

describe("localDayWindowUtc", () => {
  it("brackets a normal 24-hour local day", () => {
    const { from, to } = localDayWindowUtc(TUESDAY, TZ);

    expect(from.toISOString()).toBe("2026-07-27T22:00:00.000Z");
    expect(to.toISOString()).toBe("2026-07-28T22:00:00.000Z");
  });

  it("brackets the 23-hour spring-forward day", () => {
    const { from, to } = localDayWindowUtc("2026-03-29", TZ);

    expect(to.getTime() - from.getTime()).toBe(23 * 60 * 60 * 1000);
  });

  it("brackets the 25-hour fall-back day", () => {
    const { from, to } = localDayWindowUtc("2026-10-25", TZ);

    expect(to.getTime() - from.getTime()).toBe(25 * 60 * 60 * 1000);
  });

  it("rejects an unparseable date", () => {
    expect(() => localDayWindowUtc("nope", TZ)).toThrow(/invalid date/);
  });
});
