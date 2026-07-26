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
