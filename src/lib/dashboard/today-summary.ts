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
 * `revenueMinorUnits` also carries an assumption about *where the price comes
 * from* that anyone building payments has to revisit — see the comment at the
 * accumulation itself.
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
      // LIVE PRICE, NOT A HISTORICAL ONE. `priceMinorUnits` is read from the
      // Service row as it stands right now — there is no price snapshot on
      // Booking — so this is "what these appointments would cost at today's
      // prices", not "what was quoted when they were booked". The two diverge
      // the moment the owner edits a service's price on the services screen:
      // change a price at noon and this morning's completed cuts silently
      // re-value themselves.
      //
      // That's an acceptable approximation only while this number is a glanceable
      // indicator with no money moving behind it. IF YOU ARE HERE BUILDING
      // PAYMENTS OR DEPOSITS, STOP AND REVISIT THIS: the moment a customer is
      // charged, what they were charged is a fact about that booking and has to
      // be stored on the Booking row (a `pricePaidMinorUnits`, snapshotted at
      // creation the way `blockedUntil` already snapshots the buffer). Summing
      // live Service prices to produce a figure anyone reconciles against real
      // takings would be quietly, unfixably wrong after the first price change.
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
