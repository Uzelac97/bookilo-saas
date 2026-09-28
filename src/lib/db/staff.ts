import type { WorkingHoursRow } from "@/lib/availability/slots";
import type { StaffInput } from "@/lib/validation/staff";
import type { TimeOffRange } from "@/lib/validation/time-off";

import { prisma } from "./prisma";

export type { WorkingHoursRow };

/** One absence, as the owner's staff screen lists it. */
export type TimeOffRow = {
  id: string;
  startAt: Date;
  endAt: Date;
  reason: string | null;
};

/**
 * What a write scoped by tenant reports back. Same shape and same reasoning as
 * ServiceWriteResult in ./services.ts — "no such barber" and "another tenant's
 * barber" are one outcome on purpose.
 */
export type StaffWriteResult = { ok: true } | { ok: false; reason: "NOT_FOUND" };

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

/** A barber as the owner's staff screen needs them: the whole row plus context. */
export type ManagedStaff = {
  id: string;
  name: string;
  photoUrl: string | null;
  active: boolean;
  /** This barber's own hours, ordered for display. */
  workingHours: WorkingHoursRow[];
  /**
   * Absences that haven't finished yet, soonest first.
   *
   * Past entries are deliberately excluded rather than listed and greyed out.
   * They affect nothing — computeSlots only ever asks about a day it's
   * computing — and a screen that accumulates last year's holidays makes the one
   * being set this year harder to find. Nothing else in the app reads them, so
   * hiding them costs the owner nothing they can act on.
   */
  timeOff: TimeOffRow[];
  /**
   * CONFIRMED appointments still in the future.
   *
   * Exists so the deactivate confirmation can say "Marco has 4 upcoming
   * appointments — they stay on the calendar" rather than asking the owner to
   * remember. Deactivating is safe precisely because those bookings survive
   * (`onDelete: Restrict`, and getStaffForCalendar keeps the column), but "safe"
   * is not what it feels like without the number in front of you.
   */
  upcomingBookings: number;
};

/**
 * Every barber a tenant has, with their hours and their forward booking count.
 *
 * The third staff read in this file, and the three differ in exactly what they
 * filter: getActiveStaff is what a customer may be offered, getStaffForCalendar
 * is every column the calendar must draw, and this is the owner's list — which,
 * like the calendar's, must include retired barbers, because a screen that hides
 * them offers no way back from an accidental deactivation.
 *
 * `now` is injected rather than read here for the same reason computeSlots takes
 * it: a function that reads the clock internally can't be reasoned about from
 * its caller, and this one is called from a page render that already has one.
 */
export async function getStaffForManagement(
  tenantId: string,
  now: Date,
): Promise<ManagedStaff[]> {
  return findManagedStaff(tenantId, now);
}

/**
 * One barber, scoped by tenant, for the edit screen. Null when the id belongs to
 * nobody or to another tenant — the caller renders a 404 for both.
 *
 * `tenantId` and the id sit in the same `where`, so a guessed id from another
 * shop matches nothing rather than being fetched and filtered afterwards.
 */
export async function getStaffMember(
  tenantId: string,
  staffId: string,
  now: Date,
): Promise<ManagedStaff | null> {
  const [member] = await findManagedStaff(tenantId, now, staffId);

  return member ?? null;
}

/**
 * The one query behind both functions above, so the list and the edit screen
 * can never disagree about what a barber's hours, absences or booking count
 * are. `staffId` narrows it to one row; omitted, it returns the whole team.
 */
async function findManagedStaff(
  tenantId: string,
  now: Date,
  staffId?: string,
): Promise<ManagedStaff[]> {
  const rows = await prisma.staff.findMany({
    where: { tenantId, ...(staffId ? { id: staffId } : {}) },
    // Active first so the working list isn't pushed below the archive, then the
    // same createdAt ordering as everywhere else in this file.
    orderBy: [{ active: "desc" }, { createdAt: "asc" }],
    select: {
      id: true,
      name: true,
      photoUrl: true,
      active: true,
      workingHours: {
        orderBy: [{ dayOfWeek: "asc" }, { startMinute: "asc" }],
        select: { dayOfWeek: true, startMinute: true, endMinute: true },
      },
      timeOff: {
        // Still running or still to come. `endAt > now` rather than
        // `startAt > now`, so an absence the barber is in the middle of stays on
        // screen — that's the one the owner is most likely to be looking for.
        where: { endAt: { gt: now } },
        orderBy: { startAt: "asc" },
        select: { id: true, startAt: true, endAt: true, reason: true },
      },
      _count: {
        select: {
          bookings: {
            // CONFIRMED only. A cancelled future booking holds nothing and a
            // COMPLETED one in the future is a data error, not a commitment —
            // this number exists to answer "what does deactivating this person
            // strand", and only a confirmed appointment is stranded.
            where: { status: "CONFIRMED", startAt: { gte: now } },
          },
        },
      },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    photoUrl: row.photoUrl,
    active: row.active,
    workingHours: row.workingHours,
    timeOff: row.timeOff,
    upcomingBookings: row._count.bookings,
  }));
}

/**
 * Adds a barber. `tenantId` comes from the server-side session (CLAUDE.md rule 2).
 *
 * DELIBERATELY CREATES NO WORKING HOURS. A new barber works nowhere until the
 * owner says otherwise, and the reason is that opening hours are the union of
 * what the staff work — there is no business-level hours field
 * (EXECUTION-PLAN.md). Seeding a plausible 09:00–18:00 would therefore change
 * what the *public page* says the shop's hours are, as a side effect of adding
 * someone. The create flow sends the owner straight to the hours editor instead.
 */
export async function createStaff(
  tenantId: string,
  input: StaffInput,
): Promise<{ id: string }> {
  return prisma.staff.create({
    data: {
      tenantId,
      name: input.name,
      photoUrl: input.photoUrl ?? null,
    },
    select: { id: true },
  });
}

/**
 * Edits a barber's name or photo.
 *
 * `updateMany` rather than `update`, so `tenantId` sits in the same `where`
 * clause and a guessed id from another tenant matches nothing — see the longer
 * note on updateService in ./services.ts for why that distinction is the
 * guardrail rather than a style preference.
 */
export async function updateStaff(
  tenantId: string,
  staffId: string,
  input: StaffInput,
): Promise<StaffWriteResult> {
  const { count } = await prisma.staff.updateMany({
    where: { id: staffId, tenantId },
    data: { name: input.name, photoUrl: input.photoUrl ?? null },
  });

  return count === 0 ? { ok: false, reason: "NOT_FOUND" } : { ok: true };
}

/**
 * Retires a barber, or brings one back. THIS IS WHAT "REMOVE" MEANS (CLAUDE.md),
 * and there is deliberately no delete function here to reach for instead.
 *
 * `Booking.staffId` is `onDelete: Restrict`, so a real delete of anyone who has
 * ever been booked would fail — and if it didn't, it would take the shop's
 * history with it. Deactivating drops the barber out of getActiveStaff (the
 * public picker and the availability query) while getStaffForCalendar keeps
 * their column, so appointments already on the books stay visible in the time
 * they still occupy.
 *
 * Their WorkingHours rows are left untouched on purpose: reactivating should
 * restore the person as they were, not hand back a barber with an empty week.
 * getWorkingHoursForActiveStaff already filters on `active`, so those rows stop
 * contributing to the shop's public opening hours the moment this is set.
 */
export async function setStaffActive(
  tenantId: string,
  staffId: string,
  active: boolean,
): Promise<StaffWriteResult> {
  const { count } = await prisma.staff.updateMany({
    where: { id: staffId, tenantId },
    data: { active },
  });

  return count === 0 ? { ok: false, reason: "NOT_FOUND" } : { ok: true };
}

/**
 * Replaces a barber's whole week of working hours in one write.
 *
 * THE TENANT CHECK AT THE TOP IS LOAD-BEARING AND CANNOT BE FOLDED INTO THE
 * WRITE. `WorkingHours` has no `tenantId` column — its only tenant scope is the
 * `staffId` it hangs off — so unlike every other write in lib/db/**, there is no
 * compound `where` that can state the boundary. A `deleteMany({ where: {
 * staffId } })` with an id from another tenant would cheerfully wipe that shop's
 * hours and close their bookings page. So the staff row is re-fetched scoped by
 * `tenantId` first, exactly as createBooking re-verifies its foreign keys under
 * rule 2a, and the whole thing refuses if it doesn't belong here.
 *
 * Replace rather than diff: the editor always posts the complete week, and a
 * wholesale swap has no partial-application state to get wrong. Both statements
 * run in one `$transaction`, so an interrupted save can't leave a barber with
 * their old hours deleted and their new ones missing — which is to say, bookable
 * nowhere and silently absent from the shop's opening hours.
 *
 * An empty `rows` array is valid and means "not working this week".
 */
export async function replaceWorkingHours(
  tenantId: string,
  staffId: string,
  rows: WorkingHoursRow[],
): Promise<StaffWriteResult> {
  const staff = await prisma.staff.findFirst({
    where: { id: staffId, tenantId },
    select: { id: true },
  });

  if (!staff) return { ok: false, reason: "NOT_FOUND" };

  await prisma.$transaction([
    prisma.workingHours.deleteMany({ where: { staffId } }),
    prisma.workingHours.createMany({
      data: rows.map((row) => ({ staffId, ...row })),
    }),
  ]);

  return { ok: true };
}

/**
 * Marks a barber away for a range of instants.
 *
 * SAME HAZARD AS replaceWorkingHours ABOVE, AND THE SAME ANSWER. `TimeOff` has
 * no `tenantId` column either — its only tenant scope is the `staffId` it hangs
 * off — so a create given a `staffId` from another shop would cheerfully close
 * that shop's barber's diary, and nothing in this codebase would notice. There
 * is no compound `where` available on a create to state the boundary in, so the
 * staff row is re-fetched scoped by `tenantId` first and the write refuses if it
 * doesn't belong here. That's rule 2a applied to a table that can't speak for
 * itself.
 *
 * `startAt`/`endAt` are UTC instants already converted from the shop's wall
 * clock by toTimeOffRange (lib/validation/time-off.ts). Nothing here does date
 * math — this function stores what it's given.
 *
 * Deliberately does not touch existing bookings. TimeOff filters *candidate*
 * slots in computeSlots; appointments already made stay made. Cancelling
 * someone's haircut as a side effect of an owner marking a holiday is not a
 * decision a form gets to take — the action reports the overlap count instead.
 */
export async function createTimeOff(
  tenantId: string,
  staffId: string,
  range: TimeOffRange,
): Promise<StaffWriteResult> {
  const staff = await prisma.staff.findFirst({
    where: { id: staffId, tenantId },
    select: { id: true },
  });

  if (!staff) return { ok: false, reason: "NOT_FOUND" };

  await prisma.timeOff.create({
    data: {
      staffId,
      startAt: range.startAt,
      endAt: range.endAt,
      reason: range.reason ?? null,
    },
  });

  return { ok: true };
}

/**
 * Removes an absence, restoring the barber's availability over that range.
 *
 * A REAL DELETE, and the one place in lib/db/** where that's correct. The
 * no-hard-delete rule in CLAUDE.md names `Staff` and `Service`, and it exists
 * because `Booking` holds `onDelete: Restrict` foreign keys to both — deleting
 * either would either fail or take the shop's history with it. Nothing
 * references a `TimeOff` row. Removing one strands nothing and simply reopens
 * the time, which is exactly what the owner means by it.
 *
 * The tenant boundary travels through the relation — `staff: { tenantId }` — so
 * it sits in the same `where` clause as the id and a row belonging to another
 * shop matches nothing. Unlike the create above, no separate re-fetch is needed:
 * a delete takes a filter, so the boundary is expressible in the query itself,
 * the same way getWorkingHoursForActiveStaff scopes through `staff`.
 */
export async function deleteTimeOff(
  tenantId: string,
  timeOffId: string,
): Promise<StaffWriteResult> {
  const { count } = await prisma.timeOff.deleteMany({
    where: { id: timeOffId, staff: { tenantId } },
  });

  return count === 0 ? { ok: false, reason: "NOT_FOUND" } : { ok: true };
}
