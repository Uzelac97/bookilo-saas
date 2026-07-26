/**
 * Open-slot computation: working hours + time off + existing bookings +
 * buffer/lead time -> the start times a customer can actually pick.
 *
 * PURE BY CONTRACT (EXECUTION-PLAN.md section 3). No Prisma, no I/O, and no
 * internal `new Date()` — `now` is injected so lead-time behaviour is
 * deterministic under test. The tenant-scoped fetch that feeds this lives in
 * lib/db/availability.ts.
 *
 * The thing this module exists to get right: it must agree with the
 * `no_overlapping_bookings` exclusion constraint. schema.prisma says it
 * directly — the availability query has to treat the identical status set as
 * occupied "or you get ghost slots that look open in the UI and fail at
 * submit." So the collision test below mirrors the constraint exactly: the same
 * half-open ranges, the same blockedUntil semantics.
 */
import { DateTime } from "luxon";

/**
 * Candidate start times advance on a fixed 15-minute grid regardless of service
 * length, so a 20-minute beard trim doesn't push the rest of the day onto a
 * ragged 9:20/9:40 grid. Deliberately a module constant, not a Tenant column —
 * making it configurable is a schema change, and no customer has asked yet.
 */
export const SLOT_STEP_MINUTES = 15;

const MINUTES_PER_DAY = 24 * 60;

export type SlotRules = {
  /** IANA zone, from `tenant.timezone`. */
  timezone: string;
  /** The tenant's *current* setting — see the note in `isFreeOfBookings`. */
  bufferMinutes: number;
  minLeadMinutes: number;
};

export type WorkingHoursRow = {
  /** 0 = Sunday .. 6 = Saturday, per schema.prisma. */
  dayOfWeek: number;
  /** Minutes from midnight, tenant-local wall clock. */
  startMinute: number;
  endMinute: number;
};

export type StaffAvailability = {
  staffId: string;
  workingHours: WorkingHoursRow[];
  timeOff: { startAt: Date; endAt: Date }[];
  /**
   * CONFIRMED and COMPLETED bookings only. The caller guarantees this;
   * getStaffAvailability in lib/db/availability.ts is the one place that
   * decides it, because that status set has to stay identical to the one in
   * the exclusion constraint's WHERE clause.
   */
  bookings: { startAt: Date; blockedUntil: Date }[];
};

export type ComputeSlotsInput = {
  /** "2026-07-28" — a calendar day in the *tenant's* timezone, not UTC. */
  date: string;
  serviceDurationMinutes: number;
  rules: SlotRules;
  staff: StaffAvailability[];
  /** Injected rather than read internally, so lead-time tests are stable. */
  now: Date;
};

export type StaffSlots = {
  staffId: string;
  /** UTC instants, ascending. Formatting for display happens at the boundary. */
  slots: Date[];
};

/** A half-open interval [start, end) of UTC instants. */
type Interval = { start: DateTime; end: DateTime };

/**
 * Open slots for one tenant-local day, one entry per staff member in input
 * order. A fully-booked barber comes back with an empty `slots` array rather
 * than being dropped, so the caller can still render an empty column.
 */
export function computeSlots(input: ComputeSlotsInput): StaffSlots[] {
  const { date, serviceDurationMinutes, rules, staff, now } = input;

  const dayStart = DateTime.fromISO(date, { zone: rules.timezone });
  if (!dayStart.isValid) {
    throw new Error(
      `computeSlots: invalid date "${date}" for timezone "${rules.timezone}"`,
    );
  }
  if (serviceDurationMinutes <= 0) {
    throw new Error(
      `computeSlots: serviceDurationMinutes must be positive, got ${serviceDurationMinutes}`,
    );
  }

  // schema.prisma numbers days 0 = Sunday .. 6 = Saturday. Luxon's `weekday` is
  // 1 = Monday .. 7 = Sunday. `% 7` reconciles them (Sunday: 7 % 7 = 0). This
  // is the off-by-one that silently shifts everyone's hours by a day.
  const dayOfWeek = dayStart.weekday % 7;

  const earliestStart = DateTime.fromJSDate(now).plus({
    minutes: rules.minLeadMinutes,
  });

  return staff.map((member) => ({
    staffId: member.staffId,
    slots: slotsForStaff({
      member,
      dayStart,
      dayOfWeek,
      serviceDurationMinutes,
      rules,
      earliestStart,
    }),
  }));
}

function slotsForStaff(args: {
  member: StaffAvailability;
  dayStart: DateTime;
  dayOfWeek: number;
  serviceDurationMinutes: number;
  rules: SlotRules;
  earliestStart: DateTime;
}): Date[] {
  const {
    member,
    dayStart,
    dayOfWeek,
    serviceDurationMinutes,
    rules,
    earliestStart,
  } = args;

  const timeOff = toIntervals(member.timeOff, (t) => [t.startAt, t.endAt]);
  const booked = toIntervals(member.bookings, (b) => [b.startAt, b.blockedUntil]);

  const slots: DateTime[] = [];

  // A day can hold more than one WorkingHours row — a lunch break is simply two
  // windows. Every matching row contributes; taking only the first would eat
  // the afternoon.
  for (const row of member.workingHours) {
    if (row.dayOfWeek !== dayOfWeek) continue;

    const window = toWindow(dayStart, row);
    if (!window) continue;

    for (
      let start = window.start;
      // The service itself must fit inside the shift. The buffer deliberately
      // need not — see isFreeOfBookings.
      start.plus({ minutes: serviceDurationMinutes }) <= window.end;
      start = start.plus({ minutes: SLOT_STEP_MINUTES })
    ) {
      const end = start.plus({ minutes: serviceDurationMinutes });

      if (start < earliestStart) continue;
      if (overlapsAny({ start, end }, timeOff)) continue;
      if (!isFreeOfBookings({ start, end }, booked, rules.bufferMinutes)) continue;

      slots.push(start);
    }
  }

  // Multiple windows are appended in row order, which the database does not
  // guarantee is chronological.
  return slots
    .sort((a, b) => a.toMillis() - b.toMillis())
    .map((slot) => slot.toJSDate());
}

/**
 * Turns a WorkingHours row into a concrete instant window on the given local day.
 *
 * Minutes-from-midnight are *wall-clock* fields, so they are applied with
 * `.set()`, never `.plus({ minutes })`. On a spring-forward day
 * `plus({ minutes: 540 })` adds nine real hours to local midnight and lands on
 * 10:00 wall clock — but the barber means 09:00. `.set()` resolves the offset
 * for the day instead.
 *
 * Returns null for a row that doesn't describe a usable window, rather than
 * quietly producing a backwards one.
 */
function toWindow(dayStart: DateTime, row: WorkingHoursRow): Interval | null {
  const { startMinute, endMinute } = row;

  // Overnight shifts (end before start) are out of scope — a barbershop doesn't
  // need them and nothing downstream expects a window to cross midnight.
  if (
    startMinute < 0 ||
    endMinute > MINUTES_PER_DAY ||
    endMinute <= startMinute
  ) {
    return null;
  }

  return {
    start: atLocalMinute(dayStart, startMinute),
    end: atLocalMinute(dayStart, endMinute),
  };
}

function atLocalMinute(dayStart: DateTime, minute: number): DateTime {
  // Luxon rejects hour: 24, so a shift closing at midnight is expressed as the
  // start of the next local day — calendar arithmetic, so it stays DST-correct.
  if (minute === MINUTES_PER_DAY) {
    return dayStart.plus({ days: 1 }).startOf("day");
  }

  return dayStart.set({
    hour: Math.floor(minute / 60),
    minute: minute % 60,
    second: 0,
    millisecond: 0,
  });
}

/**
 * True when the candidate can be inserted without tripping the exclusion
 * constraint.
 *
 * The candidate is tested by its own prospective *blocked* range — service
 * length plus the tenant's current buffer — against each existing booking's
 * stored `blockedUntil`. That asymmetry is intentional and matches
 * createBooking in lib/db/bookings.ts: `blockedUntil` is snapshotted at
 * creation and never recomputed, so an old booking keeps the buffer it was made
 * under while a new one gets today's setting. Predicting anything else here
 * would disagree with the insert.
 *
 * Note the buffer extends only the *collision* test, not the working-hours fit:
 * a 30-minute cut ending exactly at 18:00 closing with a 15-minute buffer is a
 * legal last appointment, because the buffer is cleanup time rather than
 * service time. Requiring it to fit inside the shift would silently delete the
 * last slot of every day.
 */
function isFreeOfBookings(
  candidate: Interval,
  booked: Interval[],
  bufferMinutes: number,
): boolean {
  const blocked: Interval = {
    start: candidate.start,
    end: candidate.end.plus({ minutes: bufferMinutes }),
  };

  return !overlapsAny(blocked, booked);
}

function overlapsAny(candidate: Interval, others: Interval[]): boolean {
  return others.some((other) => overlaps(candidate, other));
}

/**
 * Half-open overlap, matching the `tsrange` the exclusion constraint uses. This
 * is what keeps genuine adjacency legal: a 10:00-10:30 booking does not block a
 * 10:30 start when the buffer is zero.
 */
function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end;
}

function toIntervals<T>(
  rows: T[],
  pick: (row: T) => [Date, Date],
): Interval[] {
  return rows.map((row) => {
    const [start, end] = pick(row);
    return {
      start: DateTime.fromJSDate(start),
      end: DateTime.fromJSDate(end),
    };
  });
}

/**
 * The UTC instants bounding a tenant-local calendar day, half-open [from, to).
 *
 * Exported for lib/db/availability.ts, which needs the same boundary to bound
 * its queries. One definition rather than two — a mismatch here would drop rows
 * on DST days, where a local day is 23 or 25 hours long, not 24.
 */
export function localDayWindowUtc(
  date: string,
  timezone: string,
): { from: Date; to: Date } {
  const dayStart = DateTime.fromISO(date, { zone: timezone });
  if (!dayStart.isValid) {
    throw new Error(
      `localDayWindowUtc: invalid date "${date}" for timezone "${timezone}"`,
    );
  }

  return {
    from: dayStart.toJSDate(),
    to: dayStart.plus({ days: 1 }).startOf("day").toJSDate(),
  };
}
