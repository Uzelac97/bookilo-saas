/**
 * The owner's side of booking: what to suggest, and what to warn about.
 *
 * The public flow and this one answer different questions. A customer is asked
 * "which of these times may I have?", and the answer is a closed list — the shop
 * decides. An owner is standing in their own shop and asks "put this person in
 * at 18:05", which is a statement, and the software's job is to say what that
 * collides with rather than to refuse it.
 *
 * So nothing here blocks. `suggestSlots` offers the easy path and
 * `describeConflicts` names what's unusual about a time that isn't on it. The
 * ONE rule that is not advisory lives in the database: the
 * `no_overlapping_bookings` exclusion constraint, which is what stops two people
 * being put in one chair, and it is deliberately not re-implemented here. A
 * second overlap check in application code is a second thing to keep in sync
 * with the constraint, and the constraint is the one that actually holds under
 * concurrency.
 *
 * PURE BY CONTRACT, like lib/availability/slots.ts next door: no Prisma, no I/O,
 * and no internal `new Date()` — `now` is injected so the tests are stable.
 */
import { DateTime } from "luxon";

import {
  computeSlots,
  type SlotRules,
  type StaffAvailability,
} from "@/lib/availability/slots";

/**
 * Why a manually entered time is unusual. Ordered by how much it should worry
 * the owner, most first, and every one of them is a warning rather than a
 * rejection.
 */
export type ManualBookingConflict =
  | "OVERLAPS_BOOKING"
  | "DURING_TIME_OFF"
  | "OUTSIDE_HOURS"
  | "IN_THE_PAST";

export type ManualBookingContext = {
  /** A calendar day in the tenant's timezone, "2026-07-29". */
  date: string;
  serviceDurationMinutes: number;
  rules: SlotRules;
  /** The chosen barber's availability, as lib/db/availability.ts returns it. */
  availability: StaffAvailability;
  now: Date;
};

/**
 * The times this barber is genuinely free, as one-tap suggestions.
 *
 * Reuses computeSlots rather than reimplementing the grid, with ONE override:
 * `minLeadMinutes` is forced to 0. The lead time exists so a customer can't book
 * a cut starting in four minutes while the barber is mid-haircut and can't see
 * their phone — it protects the shop from the outside. An owner typing into
 * their own dashboard is the shop, and the walk-in they're recording is already
 * standing there, so the default 60 minutes would hide every time they actually
 * need.
 *
 * Everything else is left exactly as the public flow computes it: working hours,
 * time off, existing bookings and the buffer. Those aren't protections against
 * the owner, they're facts about the day.
 *
 * Note what waiving the lead time does NOT do: `now` still bounds the list, so
 * on today's date the first suggestion is the next slot from this moment, not
 * 09:00. That's deliberate — these are one-tap suggestions, and offering a time
 * that has already been and gone is noise. An owner writing up a cut that
 * happened at 09:00 types it into the time field instead, and gets an
 * `IN_THE_PAST` warning rather than a refusal.
 */
export function suggestSlots(context: ManualBookingContext): Date[] {
  const { date, serviceDurationMinutes, rules, availability, now } = context;

  const [staffSlots] = computeSlots({
    date,
    serviceDurationMinutes,
    rules: { ...rules, minLeadMinutes: 0 },
    staff: [availability],
    now,
  });

  return staffSlots?.slots ?? [];
}

/**
 * What's unusual about putting this booking at this instant, most serious first.
 *
 * An empty array means the time is ordinary — inside the barber's hours, nothing
 * booked over it, not in the past. It does NOT mean the insert will succeed:
 * only the database can promise that, and between this call and the write
 * someone else can take the slot. That's the exclusion constraint's job, and the
 * action translates its rejection into a message.
 *
 * `OVERLAPS_BOOKING` tests against `blockedUntil` and adds the tenant's current
 * buffer to the candidate, which is exactly what `isFreeOfBookings` does in
 * slots.ts and exactly what the constraint ranges over. The asymmetry is
 * deliberate there and inherited here: an existing booking keeps the buffer it
 * was created under, a new one gets today's.
 */
export function describeConflicts(
  context: ManualBookingContext,
  startAt: Date,
): ManualBookingConflict[] {
  const { serviceDurationMinutes, rules, availability, now } = context;

  const start = DateTime.fromJSDate(startAt).setZone(rules.timezone);
  const end = start.plus({ minutes: serviceDurationMinutes });
  const blockedUntil = end.plus({ minutes: rules.bufferMinutes });

  const conflicts: ManualBookingConflict[] = [];

  const overlapsBooking = availability.bookings.some((booking) =>
    overlaps(
      { start, end: blockedUntil },
      {
        start: DateTime.fromJSDate(booking.startAt),
        end: DateTime.fromJSDate(booking.blockedUntil),
      },
    ),
  );
  if (overlapsBooking) conflicts.push("OVERLAPS_BOOKING");

  const duringTimeOff = availability.timeOff.some((off) =>
    overlaps(
      { start, end },
      {
        start: DateTime.fromJSDate(off.startAt),
        end: DateTime.fromJSDate(off.endAt),
      },
    ),
  );
  if (duringTimeOff) conflicts.push("DURING_TIME_OFF");

  if (!withinWorkingHours(context, start, end)) conflicts.push("OUTSIDE_HOURS");

  if (start < DateTime.fromJSDate(now)) conflicts.push("IN_THE_PAST");

  return conflicts;
}

/**
 * True when the whole appointment fits inside one of the barber's windows on
 * the day it starts.
 *
 * Note "one of": a booking spanning a lunch break is outside working hours even
 * though both ends fall inside a window, and saying so is correct — the barber
 * is away in the middle of it.
 *
 * The buffer is deliberately not required to fit, matching slotsForStaff: a cut
 * ending exactly at closing is a legal last appointment, because the buffer is
 * cleanup time rather than service time.
 */
function withinWorkingHours(
  context: ManualBookingContext,
  start: DateTime,
  end: DateTime,
): boolean {
  const { rules, availability } = context;

  // The weekday of the instant itself, not of `context.date`: a manual time can
  // be typed as 00:30 on a day whose local date has already rolled over.
  const dayStart = start.setZone(rules.timezone).startOf("day");
  const dayOfWeek = dayStart.weekday % 7;

  return availability.workingHours.some((row) => {
    if (row.dayOfWeek !== dayOfWeek) return false;
    if (row.endMinute <= row.startMinute) return false;

    // .set() rather than .plus({ minutes }), for the reason toWindow gives in
    // slots.ts: these are wall-clock offsets, and on a spring-forward day adding
    // 540 real minutes to local midnight lands an hour off what the barber means.
    const windowStart = atLocalMinute(dayStart, row.startMinute);
    const windowEnd = atLocalMinute(dayStart, row.endMinute);

    return start >= windowStart && end <= windowEnd;
  });
}

const MINUTES_PER_DAY = 24 * 60;

function atLocalMinute(dayStart: DateTime, minute: number): DateTime {
  // Luxon rejects hour: 24, so a shift closing at midnight is the start of the
  // next local day — calendar arithmetic, so it stays DST-correct.
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

/** Half-open overlap, matching the tsrange the exclusion constraint uses. */
function overlaps(
  a: { start: DateTime; end: DateTime },
  b: { start: DateTime; end: DateTime },
): boolean {
  return a.start < b.end && b.start < a.end;
}

/**
 * A tenant-local date and wall-clock time as a UTC instant, or null if that
 * local time doesn't exist.
 *
 * The null case is the spring-forward gap. On 30 March 2026 in Berlin the clocks
 * jump 02:00 → 03:00, so 02:30 is not a time that happens — and Luxon does not
 * fail on it, it silently returns 03:30. Left alone, an owner typing 02:30 would
 * get a booking an hour later than they asked for, with nothing to tell them.
 * Round-tripping the formatted value back to the input is what catches it: if
 * Luxon moved the time, the string it formats no longer matches what was typed.
 *
 * The autumn ambiguity — 02:30 happening twice — is deliberately NOT rejected.
 * Both readings are real times, Luxon picks the first, and a shop can't be
 * expected to answer "which 02:30" for an appointment nobody books at 02:30.
 */
export function localInstant(
  date: string,
  time: string,
  timezone: string,
): Date | null {
  // Padded before the string is built, not after: ISO 8601 requires a two-digit
  // hour, so `2026-07-28T9:05` is invalid and Luxon rejects it outright. An
  // <input type="time"> always pads, but the action also serves prefilled links
  // from the calendar, and "9:05" is what a hand-written one looks like.
  const normalized = normalizeTime(time);
  if (normalized === null) return null;

  const local = DateTime.fromISO(`${date}T${normalized}`, { zone: timezone });

  if (!local.isValid) return null;
  if (local.toFormat("HH:mm") !== normalized) return null;

  return local.toJSDate();
}

/** "9:05" -> "09:05". Null when the value isn't a wall-clock time at all. */
function normalizeTime(time: string): string | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!match) return null;

  return `${match[1].padStart(2, "0")}:${match[2]}`;
}
