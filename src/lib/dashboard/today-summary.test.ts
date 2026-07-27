import { describe, expect, it } from "vitest";

import type { DashboardBooking } from "@/lib/db/bookings";

import { summariseDay } from "./today-summary";

/** A UTC instant, written the way the database stores one. */
function utc(iso: string): Date {
  return new Date(`${iso}Z`);
}

const NOW = utc("2026-07-28T10:00:00");

let seq = 0;

/**
 * A booking at a given hour. Only the fields summariseDay reads carry meaning —
 * the rest exist so the value is a real DashboardBooking rather than a cast.
 */
function booking(
  hour: string,
  overrides: Partial<
    Pick<DashboardBooking, "status" | "source"> & { price: number }
  > = {},
): DashboardBooking {
  const startAt = utc(`2026-07-28T${hour}:00`);
  const { status = "CONFIRMED", source = "ONLINE", price = 2500 } = overrides;
  seq += 1;

  return {
    id: `booking-${seq}`,
    startAt,
    endAt: new Date(startAt.getTime() + 30 * 60_000),
    status,
    source,
    service: { name: "Haircut", priceMinorUnits: price },
    staff: { id: "staff-marco", name: "Marco Rossi" },
    customer: { name: "Luka M.", phone: "+4930111", email: null },
  };
}

describe("summariseDay", () => {
  it("returns an empty day rather than nulls to unpack", () => {
    expect(summariseDay([], NOW)).toEqual({
      booked: 0,
      next: null,
      revenueMinorUnits: 0,
    });
  });

  it("counts and sums the ordinary case", () => {
    const summary = summariseDay(
      [
        booking("09:00", { price: 2500 }),
        booking("11:00", { price: 1500 }),
        booking("14:00", { price: 3500 }),
      ],
      NOW,
    );

    expect(summary.booked).toBe(3);
    expect(summary.revenueMinorUnits).toBe(7500);
  });

  it("picks the first appointment still ahead of now", () => {
    const summary = summariseDay(
      [booking("09:00"), booking("11:00"), booking("14:00")],
      NOW,
    );

    expect(summary.next?.startAt).toEqual(utc("2026-07-28T11:00:00"));
  });

  it("has no next appointment once the last one has started", () => {
    const summary = summariseDay([booking("08:00"), booking("09:00")], NOW);

    expect(summary.next).toBeNull();
    // The day being over doesn't erase it — it still happened and still earned.
    expect(summary.booked).toBe(2);
    expect(summary.revenueMinorUnits).toBe(5000);
  });

  it("treats a booking starting exactly now as no longer upcoming", () => {
    // Strictly ahead of now: an appointment starting this second is the one in
    // the chair, not the one to point the owner at next.
    expect(summariseDay([booking("10:00")], NOW).next).toBeNull();
  });

  it("excludes a cancellation from both the count and the revenue", () => {
    const summary = summariseDay(
      [
        booking("09:00", { price: 2500 }),
        booking("11:00", { status: "CANCELLED", price: 9900 }),
      ],
      NOW,
    );

    expect(summary.booked).toBe(1);
    expect(summary.revenueMinorUnits).toBe(2500);
    // ...and it must not be offered as what's coming up next, even though it is
    // the only future booking in the list.
    expect(summary.next).toBeNull();
  });

  it("counts a no-show but does not let it earn", () => {
    const summary = summariseDay(
      [booking("09:00", { status: "NO_SHOW", price: 2500 })],
      NOW,
    );

    expect(summary.booked).toBe(1);
    expect(summary.revenueMinorUnits).toBe(0);
  });

  it("counts a completed appointment as earned", () => {
    const summary = summariseDay(
      [booking("09:00", { status: "COMPLETED", price: 2500 })],
      NOW,
    );

    expect(summary.booked).toBe(1);
    expect(summary.revenueMinorUnits).toBe(2500);
    // Already done, so it is not what's next either.
    expect(summary.next).toBeNull();
  });

  it("skips past a completed booking to find the next confirmed one", () => {
    const summary = summariseDay(
      [
        booking("11:00", { status: "COMPLETED" }),
        booking("12:00", { status: "CANCELLED" }),
        booking("13:00"),
      ],
      NOW,
    );

    expect(summary.next?.startAt).toEqual(utc("2026-07-28T13:00:00"));
  });
});
