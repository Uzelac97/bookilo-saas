import { DateTime } from "luxon";
import { describe, expect, it } from "vitest";

import {
  timeOffPayloadSchema,
  toTimeOffRange,
  type TimeOffPayload,
} from "./time-off";

const TZ = "Europe/Berlin";

function payload(overrides: Partial<TimeOffPayload> = {}): TimeOffPayload {
  return {
    allDay: true,
    startDate: "2026-08-10",
    endDate: "2026-08-12",
    startTime: "",
    endTime: "",
    ...overrides,
  };
}

/** The range as tenant-local wall clock, which is how the owner picked it. */
function local(instant: Date): string {
  return DateTime.fromJSDate(instant).setZone(TZ).toFormat("yyyy-MM-dd HH:mm");
}

function range(overrides: Partial<TimeOffPayload> = {}) {
  const result = toTimeOffRange(payload(overrides), TZ);
  if (!result.ok) throw new Error(`expected a range, got: ${result.message}`);

  return result.range;
}

describe("toTimeOffRange — all day", () => {
  it("covers whole local days and includes the end date", () => {
    // "Away the 10th to the 12th" means the 12th isn't a working day either, so
    // the range runs to the start of the 13th. Half-open, like every other range
    // in this codebase.
    const { startAt, endAt } = range();

    expect(local(startAt)).toBe("2026-08-10 00:00");
    expect(local(endAt)).toBe("2026-08-13 00:00");
  });

  it("treats a single day as one day", () => {
    const { startAt, endAt } = range({
      startDate: "2026-08-10",
      endDate: "2026-08-10",
    });

    expect(local(startAt)).toBe("2026-08-10 00:00");
    expect(local(endAt)).toBe("2026-08-11 00:00");
  });

  it("falls back to the start date when no end date is given", () => {
    const { startAt, endAt } = range({ endDate: "" });

    expect(local(startAt)).toBe("2026-08-10 00:00");
    expect(local(endAt)).toBe("2026-08-11 00:00");
  });

  it("stores UTC instants, not local wall clock", () => {
    // Berlin is UTC+2 in August. The column has no timezone attached, so what
    // goes in must already be the instant.
    const { startAt } = range();

    expect(startAt.toISOString()).toBe("2026-08-09T22:00:00.000Z");
  });

  it("is exactly one local day across the spring-forward, not 24 hours", () => {
    // THE CASE localDayWindowUtc IS REUSED FOR. 2026-03-29 is 23 hours long in
    // Berlin. Hand-rolled `.plus({ days: 1 })` on local midnight would end the
    // absence an hour into the 30th, leaving a barber bookable at 00:00–01:00 on
    // a day they are away.
    const { startAt, endAt } = range({
      startDate: "2026-03-29",
      endDate: "2026-03-29",
    });

    expect(local(startAt)).toBe("2026-03-29 00:00");
    expect(local(endAt)).toBe("2026-03-30 00:00");
    expect(endAt.getTime() - startAt.getTime()).toBe(23 * 60 * 60_000);
  });

  it("is 25 hours across the autumn fall-back", () => {
    const { startAt, endAt } = range({
      startDate: "2026-10-25",
      endDate: "2026-10-25",
    });

    expect(endAt.getTime() - startAt.getTime()).toBe(25 * 60 * 60_000);
  });

  it("rejects an end date before the start", () => {
    const result = toTimeOffRange(
      payload({ startDate: "2026-08-12", endDate: "2026-08-10" }),
      TZ,
    );

    expect(result).toEqual({
      ok: false,
      message: "validation.lastDayBeforeFirst",
    });
  });

  it("rejects a span longer than a year", () => {
    // A mis-keyed year is the real case: it would close the booking page
    // indefinitely and nothing downstream would report it.
    const result = toTimeOffRange(
      payload({ startDate: "2026-08-10", endDate: "2027-08-12" }),
      TZ,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toBe("validation.longerThanYear");
  });

  it("accepts a span of exactly a year", () => {
    expect(
      toTimeOffRange(
        payload({ startDate: "2026-08-10", endDate: "2027-08-09" }),
        TZ,
      ).ok,
    ).toBe(true);
  });

  it("reports an unreadable date rather than throwing", () => {
    // localDayWindowUtc throws; a date input can still post something malformed.
    const result = toTimeOffRange(payload({ startDate: "not-a-date" }), TZ);

    expect(result).toEqual({
      ok: false,
      message: "validation.datesUnreadable",
    });
  });
});

describe("toTimeOffRange — timed", () => {
  const timed = { allDay: false, startTime: "14:00", endTime: "16:30" };

  it("applies the times to the start date in the shop's zone", () => {
    const { startAt, endAt } = range(timed);

    expect(local(startAt)).toBe("2026-08-10 14:00");
    expect(local(endAt)).toBe("2026-08-10 16:30");
  });

  it("ignores the end date entirely, so it can't span midnight", () => {
    // One date by design. A timed range across days is a shape nobody asked for
    // and reads ambiguously in the list; all-day mode covers multi-day absences.
    const { endAt } = range({ ...timed, endDate: "2026-08-20" });

    expect(local(endAt)).toBe("2026-08-10 16:30");
  });

  it("rejects an end time that isn't after the start", () => {
    for (const endTime of ["14:00", "13:00"]) {
      const result = toTimeOffRange(payload({ ...timed, endTime }), TZ);

      expect(result).toEqual({
        ok: false,
        message: "validation.endBeforeStart",
      });
    }
  });

  it("rejects missing or malformed times", () => {
    for (const times of [
      { startTime: "", endTime: "16:30" },
      { startTime: "14:00", endTime: "" },
      { startTime: "9am", endTime: "16:30" },
      { startTime: "25:00", endTime: "26:00" },
      { startTime: "14:60", endTime: "16:30" },
    ]) {
      const result = toTimeOffRange(payload({ allDay: false, ...times }), TZ);

      expect(result).toEqual({
        ok: false,
        message: "validation.timesRequired",
      });
    }
  });

  it("resolves a wall-clock time correctly on a DST day", () => {
    // 02:00–03:00 local doesn't exist on the spring-forward day. Luxon resolves
    // the offset for the day rather than producing an invalid instant.
    const { startAt, endAt } = range({
      allDay: false,
      startDate: "2026-03-29",
      startTime: "14:00",
      endTime: "16:00",
    });

    expect(local(startAt)).toBe("2026-03-29 14:00");
    expect(local(endAt)).toBe("2026-03-29 16:00");
  });
});

describe("timeOffPayloadSchema", () => {
  it("accepts an optional reason", () => {
    const parsed = timeOffPayloadSchema.safeParse({
      ...payload(),
      reason: "Holiday",
    });

    expect(parsed.success).toBe(true);
  });

  it("rejects a reason that is too long or spans lines", () => {
    for (const reason of ["x".repeat(81), "Holiday\nand more"]) {
      const parsed = timeOffPayloadSchema.safeParse({ ...payload(), reason });
      expect(parsed.success).toBe(false);
    }
  });

  it("requires a start date", () => {
    const parsed = timeOffPayloadSchema.safeParse({
      ...payload(),
      startDate: "",
    });

    expect(parsed.success).toBe(false);
  });
});
