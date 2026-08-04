import { DateTime, Settings } from "luxon";
import { describe, expect, it } from "vitest";

import type { StaffAvailability } from "@/lib/availability/slots";

import {
  describeConflicts,
  localInstant,
  suggestSlots,
  type ManualBookingContext,
} from "./manual-booking";

const TZ = "Europe/Berlin";

// 2026-07-28 is a Tuesday -> dayOfWeek 2 in the schema's 0 = Sunday numbering.
const TUESDAY = "2026-07-28";
const TUESDAY_DOW = 2;

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

function availability(
  overrides: Partial<StaffAvailability> = {},
): StaffAvailability {
  return {
    staffId: "marco",
    workingHours: [NINE_TO_SIX],
    timeOff: [],
    bookings: [],
    ...overrides,
  };
}

function context(
  overrides: Partial<ManualBookingContext> = {},
): ManualBookingContext {
  return {
    date: TUESDAY,
    serviceDurationMinutes: 30,
    // minLeadMinutes is the tenant's real setting; suggestSlots is what waives it.
    rules: { timezone: TZ, bufferMinutes: 0, minLeadMinutes: 60 },
    availability: availability(),
    now: local(TUESDAY, "10:00"),
    ...overrides,
  };
}

describe("suggestSlots", () => {
  it("ignores the tenant's lead time, so a walk-in standing there can be booked", () => {
    // The whole reason this exists rather than calling computeSlots directly.
    // now is 10:00 and the lead time is 60 minutes, so the public flow's first
    // offer would be 11:00.
    const slots = hhmm(suggestSlots(context()));

    expect(slots).toContain("10:00");
    expect(slots).toContain("10:15");
  });

  it("still starts from now, because a suggestion in the past is noise", () => {
    // Waiving the lead time is not the same as ignoring the clock. The owner
    // writing up a 09:00 cut at 10:00 types the time instead and gets a warning.
    const slots = hhmm(suggestSlots(context()));

    expect(slots[0]).toBe("10:00");
    expect(slots).not.toContain("09:00");
  });

  it("offers the whole day when the day hasn't started yet", () => {
    const slots = hhmm(suggestSlots(context({ now: local(TUESDAY, "06:00") })));

    expect(slots[0]).toBe("09:00");
  });

  it("still respects working hours, time off and existing bookings", () => {
    // Those aren't protections against the owner — they're facts about the day.
    const slots = hhmm(
      suggestSlots(
        context({
          availability: availability({
            bookings: [
              {
                startAt: local(TUESDAY, "11:00"),
                blockedUntil: local(TUESDAY, "11:30"),
              },
            ],
            timeOff: [
              {
                startAt: local(TUESDAY, "14:00"),
                endAt: local(TUESDAY, "15:00"),
              },
            ],
          }),
        }),
      ),
    );

    expect(slots).not.toContain("11:00");
    expect(slots).not.toContain("14:00");
    expect(slots).not.toContain("08:45");
    // The last start that still fits a 30-minute cut before 18:00.
    expect(slots[slots.length - 1]).toBe("17:30");
  });

  it("returns nothing for a day this barber doesn't work", () => {
    // 2026-07-26 is a Sunday and the fixture has no Sunday hours.
    expect(suggestSlots(context({ date: "2026-07-26" }))).toEqual([]);
  });
});

describe("describeConflicts", () => {
  it("says nothing about an ordinary time", () => {
    expect(describeConflicts(context(), local(TUESDAY, "11:00"))).toEqual([]);
  });

  it("flags a time outside the barber's hours without refusing it", () => {
    // The 18:05 walk-in that motivated the advisory design.
    expect(describeConflicts(context(), local(TUESDAY, "18:05"))).toEqual([
      "OUTSIDE_HOURS",
    ]);
  });

  it("flags an appointment that starts inside hours but runs past closing", () => {
    // 17:45 + 30 minutes = 18:15. The barber is gone for the last quarter of it.
    expect(describeConflicts(context(), local(TUESDAY, "17:45"))).toEqual([
      "OUTSIDE_HOURS",
    ]);
  });

  it("flags an appointment spanning a lunch break, both ends inside a window", () => {
    const split = context({
      availability: availability({
        workingHours: [
          { dayOfWeek: TUESDAY_DOW, startMinute: 9 * 60, endMinute: 13 * 60 },
          { dayOfWeek: TUESDAY_DOW, startMinute: 14 * 60, endMinute: 18 * 60 },
        ],
      }),
      serviceDurationMinutes: 120,
    });

    // 12:30–14:30: starts in the morning window, ends in the afternoon one, and
    // the barber is away in the middle of it.
    expect(describeConflicts(split, local(TUESDAY, "12:30"))).toEqual([
      "OUTSIDE_HOURS",
    ]);
  });

  it("flags an overlap with an existing booking", () => {
    const withBooking = context({
      availability: availability({
        bookings: [
          {
            startAt: local(TUESDAY, "11:00"),
            blockedUntil: local(TUESDAY, "11:30"),
          },
        ],
      }),
    });

    expect(describeConflicts(withBooking, local(TUESDAY, "11:15"))).toEqual([
      "OVERLAPS_BOOKING",
    ]);
  });

  it("treats back-to-back appointments as no overlap", () => {
    // Half-open, matching the tsrange the exclusion constraint uses: 11:30 is
    // free the moment an 11:00–11:30 booking ends, when the buffer is zero.
    const withBooking = context({
      availability: availability({
        bookings: [
          {
            startAt: local(TUESDAY, "11:00"),
            blockedUntil: local(TUESDAY, "11:30"),
          },
        ],
      }),
    });

    expect(describeConflicts(withBooking, local(TUESDAY, "11:30"))).toEqual([]);
  });

  it("counts the tenant's current buffer against the new booking", () => {
    // The candidate is tested by its own blocked range — service plus today's
    // buffer — exactly as isFreeOfBookings does before an insert.
    const buffered = context({
      rules: { timezone: TZ, bufferMinutes: 15, minLeadMinutes: 60 },
      availability: availability({
        bookings: [
          {
            startAt: local(TUESDAY, "11:30"),
            blockedUntil: local(TUESDAY, "12:00"),
          },
        ],
      }),
    });

    // 11:00 + 30 minutes = 11:30, then 15 minutes of buffer runs to 11:45 and
    // bites into the existing booking.
    expect(describeConflicts(buffered, local(TUESDAY, "11:00"))).toEqual([
      "OVERLAPS_BOOKING",
    ]);
  });

  it("flags time off", () => {
    const away = context({
      availability: availability({
        timeOff: [
          { startAt: local(TUESDAY, "14:00"), endAt: local(TUESDAY, "15:00") },
        ],
      }),
    });

    expect(describeConflicts(away, local(TUESDAY, "14:30"))).toEqual([
      "DURING_TIME_OFF",
    ]);
  });

  it("flags a time already gone, for the owner writing up this morning", () => {
    expect(describeConflicts(context(), local(TUESDAY, "09:00"))).toEqual([
      "IN_THE_PAST",
    ]);
  });

  it("reports every conflict at once, most serious first", () => {
    const messy = context({
      availability: availability({
        bookings: [
          {
            startAt: local(TUESDAY, "08:00"),
            blockedUntil: local(TUESDAY, "08:45"),
          },
        ],
        timeOff: [
          { startAt: local(TUESDAY, "08:00"), endAt: local(TUESDAY, "09:00") },
        ],
      }),
    });

    // 08:30 is before the shift starts, inside time off, over a booking, and in
    // the past relative to a 10:00 "now".
    expect(describeConflicts(messy, local(TUESDAY, "08:30"))).toEqual([
      "OVERLAPS_BOOKING",
      "DURING_TIME_OFF",
      "OUTSIDE_HOURS",
      "IN_THE_PAST",
    ]);
  });
});

describe("localInstant", () => {
  it("converts a tenant-local wall clock to the stored UTC instant", () => {
    // Berlin is UTC+2 in July.
    expect(localInstant(TUESDAY, "14:30", TZ)?.toISOString()).toBe(
      "2026-07-28T12:30:00.000Z",
    );
  });

  it("resolves the offset for the day, not for today", () => {
    // January is UTC+1, so the same wall clock is a different instant.
    expect(localInstant("2026-01-13", "14:30", TZ)?.toISOString()).toBe(
      "2026-01-13T13:30:00.000Z",
    );
  });

  it("rejects a wall-clock time that doesn't exist", () => {
    // 2026-03-29, Berlin: the clocks jump 02:00 -> 03:00, so 02:30 never
    // happens. Luxon silently returns 03:30 rather than failing, which would
    // hand the owner a booking an hour later than they typed.
    expect(localInstant("2026-03-29", "02:30", TZ)).toBeNull();
  });

  it("accepts the ambiguous hour when the clocks go back", () => {
    // 2026-10-25, Berlin: 02:30 happens twice. Both readings are real times and
    // Luxon takes the first — not something to make a shop answer for an
    // appointment nobody books at 02:30.
    expect(localInstant("2026-10-25", "02:30", TZ)).not.toBeNull();
  });

  it("accepts an unpadded hour", () => {
    expect(localInstant(TUESDAY, "9:05", TZ)?.toISOString()).toBe(
      localInstant(TUESDAY, "09:05", TZ)?.toISOString(),
    );
  });

  it("returns null for a time or date it can't parse", () => {
    expect(localInstant(TUESDAY, "", TZ)).toBeNull();
    expect(localInstant(TUESDAY, "25:00", TZ)).toBeNull();
    expect(localInstant("not-a-date", "09:00", TZ)).toBeNull();
  });

  it("is unaffected by the runtime's locale", () => {
    // The regression this guards is not hypothetical arithmetic: the
    // spring-forward check used to compare `toFormat("HH:mm")` against the typed
    // string, and Luxon renders digits in the locale's numbering system. Under
    // ar-EG that side comes back as Arabic-Indic digits, never equals the ASCII
    // input, and EVERY manual booking is rejected as a time that doesn't exist.
    //
    // Restored in a finally, because Settings is global to the process and
    // leaking it would quietly retune every other test file in the run.
    const original = Settings.defaultLocale;

    try {
      Settings.defaultLocale = "ar-EG";

      expect(localInstant(TUESDAY, "14:30", TZ)?.toISOString()).toBe(
        "2026-07-28T12:30:00.000Z",
      );
      // The DST rejection still has to work under the same locale — a check
      // that fails open would pass the line above just as happily.
      expect(localInstant("2026-03-29", "02:30", TZ)).toBeNull();
    } finally {
      Settings.defaultLocale = original;
    }
  });
});
