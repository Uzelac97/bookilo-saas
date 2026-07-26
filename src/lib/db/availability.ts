import {
  localDayWindowUtc,
  type StaffAvailability,
} from "@/lib/availability/slots";

import { prisma } from "./prisma";

export type { StaffAvailability };

/**
 * The status set that counts as "this slot is occupied".
 *
 * This must stay identical to the WHERE clause of the `no_overlapping_bookings`
 * exclusion constraint in
 * prisma/migrations/20260725124130_add_booking_overlap_constraint. COMPLETED is
 * in the list on purpose: dropping it would make marking a booking complete
 * silently reopen its own slot in the UI, and the insert would then fail with
 * SLOT_TAKEN. CANCELLED is absent for the same reason in reverse — cancelling
 * frees the slot, which is what probe phase E asserts.
 */
const OCCUPYING_STATUSES = ["CONFIRMED", "COMPLETED"] as const;

/**
 * Everything computeSlots needs for one tenant-local day, scoped to one tenant.
 *
 * Deliberately dumb: it fetches and shapes, it does not compute. All the slot
 * logic lives in the pure function in lib/availability/slots.ts.
 *
 * `tenantId` comes from the server-side session on dashboard routes, or from
 * the slug lookup on public routes — never from client input (CLAUDE.md rule 2).
 */
export async function getStaffAvailability(
  tenantId: string,
  opts: { date: string; timezone: string; staffId?: string },
): Promise<StaffAvailability[]> {
  const { date, timezone, staffId } = opts;
  const { from, to } = localDayWindowUtc(date, timezone);

  const staff = await prisma.staff.findMany({
    where: {
      tenantId,
      // Only bookable barbers. "Removing" staff is always active = false, never
      // a delete, so inactive rows are expected to exist and must not surface.
      active: true,
      ...(staffId ? { id: staffId } : {}),
    },
    // ORDERING CONTRACT — must stay identical to getActiveStaff in ./staff.ts.
    // mergeStaffSlots in lib/availability/booking-options.ts preserves this
    // order into each slot's `staffIds`, and the "any barber" path resolves a
    // booking by taking the first id in that array. These two `orderBy` clauses
    // together decide which barber a customer actually gets, so a change here
    // that isn't mirrored there makes that choice arbitrary — with no test
    // failure to warn you.
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      // All seven rows, not just today's: computeSlots owns the 0=Sunday..6
      // weekday mapping, and duplicating that conversion here is how the two
      // drift apart. It's at most a handful of rows per barber.
      workingHours: {
        select: { dayOfWeek: true, startMinute: true, endMinute: true },
      },
      timeOff: {
        // Overlap, not containment: a week-long holiday has neither endpoint
        // inside today and would be missed by a startAt-only filter.
        where: { startAt: { lt: to }, endAt: { gt: from } },
        select: { startAt: true, endAt: true },
      },
      bookings: {
        where: {
          // Redundant with the staff scope above, but this is the query that
          // decides whether a slot is free — it states its own tenant boundary
          // rather than inheriting one.
          tenantId,
          status: { in: [...OCCUPYING_STATUSES] },
          // Same overlap reasoning, against blockedUntil rather than endAt: an
          // appointment that started before this window can still be blocking
          // into it, and that is exactly what the constraint ranges over.
          startAt: { lt: to },
          blockedUntil: { gt: from },
        },
        select: { startAt: true, blockedUntil: true },
      },
    },
  });

  return staff.map((member) => ({
    staffId: member.id,
    workingHours: member.workingHours,
    timeOff: member.timeOff,
    bookings: member.bookings,
  }));
}
