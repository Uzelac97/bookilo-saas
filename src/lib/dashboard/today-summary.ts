/**
 * The three numbers the dashboard's "today" strip shows.
 *
 * Pure and side-effect free, `now` injected rather than read from the clock —
 * same shape as lib/availability/*, and for the same reason: these are business
 * rules about money and cancellations, and rules that live inside a component
 * can't be tested.
 */
import type { DashboardBooking } from "@/lib/db/bookings";

export type DaySummary = {
  /** Appointments still on the books, cancellations excluded. */
  booked: number;
  /** The next appointment yet to start, or null once the day is done. */
  next: DashboardBooking | null;
  /** What the day is worth, in EUR cents. */
  revenueMinorUnits: number;
};

/**
 * Summarises one day's bookings.
 *
 * Assumes `bookings` is already in `startAt` order — getBookingsForDay
 * guarantees it — so `next` is a first-match rather than a sort.
 *
 * The three filters are deliberately different from one another:
 *
 * - `booked` drops CANCELLED only. A no-show still occupied the chair and is
 *   still something the owner wants counted against their day.
 * - `next` is CONFIRMED only. A booking already marked COMPLETED isn't ahead of
 *   anyone, and a NO_SHOW who is somehow still in the future is not something to
 *   put under a "next up" heading.
 * - `revenueMinorUnits` counts CONFIRMED and COMPLETED. NO_SHOW is excluded
 *   because nobody paid — this is the one that quietly reads high if the filter
 *   gets copied from `booked`, and it's the number an owner would trust most.
 *
 * Price comes off the Booking's Service row, so it's whatever that service costs
 * now, not what it cost when the appointment was made. There's no price snapshot
 * on Booking and adding one for a screen with no payments behind it would be
 * inventing a column — worth revisiting if deposits ever ship.
 */
export function summariseDay(
  bookings: DashboardBooking[],
  now: Date,
): DaySummary {
  let booked = 0;
  let revenueMinorUnits = 0;
  let next: DashboardBooking | null = null;

  for (const booking of bookings) {
    if (booking.status !== "CANCELLED") booked += 1;

    if (booking.status === "CONFIRMED" || booking.status === "COMPLETED") {
      revenueMinorUnits += booking.service.priceMinorUnits;
    }

    if (
      next === null &&
      booking.status === "CONFIRMED" &&
      booking.startAt.getTime() > now.getTime()
    ) {
      next = booking;
    }
  }

  return { booked, next, revenueMinorUnits };
}
