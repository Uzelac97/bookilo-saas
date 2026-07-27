import type { WorkingHoursRow } from "@/lib/availability/slots";

import { prisma } from "./prisma";

export type { WorkingHoursRow };

/**
 * A staff member as the public booking flow needs them. Narrower than the Prisma
 * model, same reasoning as PublicService in ./services.ts.
 */
export type PublicStaff = {
  id: string;
  name: string;
  photoUrl: string | null;
};

/**
 * The bookable barbers for one tenant, for the "preferred barber" picker.
 *
 * `active: true` is load-bearing, not cosmetic: there is no hard-delete for
 * Staff (CLAUDE.md) — "removing" one always means active = false — so retired
 * rows are expected to exist and must never be offered to a customer.
 *
 * ORDERING CONTRACT — must stay identical to getStaffAvailability in
 * ./availability.ts. That function returns per-staff availability in its own
 * order, mergeStaffSlots in lib/availability/booking-options.ts preserves that
 * order into each slot's `staffIds`, and the "any barber" path resolves a
 * booking by taking the first id in that array. So these two `orderBy` clauses
 * together decide which barber a customer actually gets. Change one and the
 * other must change with it — otherwise the picker labels one barber while the
 * booking silently goes to another, and no test fails.
 */
export async function getActiveStaff(tenantId: string): Promise<PublicStaff[]> {
  return prisma.staff.findMany({
    where: { tenantId, active: true },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, photoUrl: true },
  });
}

/** A staff member as the owner's calendar needs them. */
export type CalendarStaff = {
  id: string;
  name: string;
  /** False for a "removed" barber — see below. Never a reason to hide the row. */
  active: boolean;
};

/**
 * Every barber a tenant has ever had, active or not, in the same order.
 *
 * The one function in this file that deliberately does NOT filter on `active`,
 * and the reason is the soft delete. "Removing" a barber is always
 * `active = false` (CLAUDE.md) and `Booking.staffId` is `onDelete: Restrict`, so
 * a deactivated barber keeps every appointment they were ever booked for —
 * including ones still in the future. A calendar that took its columns from
 * getActiveStaff would drop those appointments off the screen entirely while
 * they still occupy real time in the shop, and the owner's first sign of it
 * would be two customers arriving for the same chair.
 *
 * Callers get `active` so they can render a retired barber's column differently
 * and sort it out of the way — not so they can filter it out. The public booking
 * flow is the opposite case and must keep using getActiveStaff above: a customer
 * may never be offered a barber who no longer works here.
 *
 * Same `createdAt` ordering as getActiveStaff, so a barber sits in the same
 * position on the calendar as in the booking flow. Not the load-bearing ordering
 * contract documented there — nothing resolves a booking from this order — but
 * gratuitously disagreeing with it would be its own kind of confusing.
 */
export async function getStaffForCalendar(
  tenantId: string,
): Promise<CalendarStaff[]> {
  return prisma.staff.findMany({
    where: { tenantId },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, active: true },
  });
}

/**
 * Every working-hours row belonging to a tenant's *active* staff, unmerged.
 *
 * This is what "when is the shop open" resolves to: there is no business-level
 * hours field by design (EXECUTION-PLAN.md) — opening hours are the union of
 * what the barbers actually work, and "closed Sunday" is simply the absence of
 * Sunday rows. Merging that union into displayable intervals is
 * mergeOpeningHours in lib/availability/opening-hours.ts; this function only
 * fetches.
 *
 * Inactive staff are excluded for the same reason inactive services are: a
 * deactivated barber's hours would otherwise keep the shop looking open on a
 * day nobody is working.
 *
 * The tenant scope travels through the `staff` relation rather than a separate
 * staff-id lookup — one query, and the tenant boundary is still stated here
 * explicitly rather than inherited from a caller.
 */
export async function getWorkingHoursForActiveStaff(
  tenantId: string,
): Promise<WorkingHoursRow[]> {
  return prisma.workingHours.findMany({
    where: { staff: { tenantId, active: true } },
    select: { dayOfWeek: true, startMinute: true, endMinute: true },
  });
}
