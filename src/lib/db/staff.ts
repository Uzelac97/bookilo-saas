import type { WorkingHoursRow } from "@/lib/availability/slots";

import { prisma } from "./prisma";

export type { WorkingHoursRow };

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
