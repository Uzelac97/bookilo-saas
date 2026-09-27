import { DateTime } from "luxon";
import { z } from "zod";

// Messages are keys into lib/i18n/messages, not prose — see the note in
// ./auth.ts. Tests read them back through the English dictionary.

import { localDayWindowUtc } from "@/lib/availability/slots";

import { hasControlCharacters } from "./text";

/**
 * A ceiling on how long one absence can be.
 *
 * Not tidiness. A mis-keyed year — 2027 for 2026 on the end date — produces a
 * range that closes a barber's bookings indefinitely, and nothing downstream
 * would report it: computeSlots would simply return no slots, the public page
 * would render a month of empty days, and the owner's first sign of it would be
 * the phone not ringing. A year is far past any real holiday and well short of
 * the range a typo produces.
 */
const MAX_SPAN_DAYS = 365;

/** A label for the owner's own list, not a record of anything. */
const MAX_REASON_LENGTH = 80;

/**
 * The raw form values, before any of them mean anything.
 *
 * Times are optional because they only exist in timed mode; `toTimeOffRange`
 * below is what decides whether their absence is legal.
 */
export const timeOffPayloadSchema = z.object({
  allDay: z.boolean(),
  startDate: z.string().trim().min(1, "validation.startDateRequired"),
  endDate: z.string().trim(),
  startTime: z.string().trim(),
  endTime: z.string().trim(),
  reason: z
    .string()
    .trim()
    .max(MAX_REASON_LENGTH, "validation.noteTooLong")
    .refine(
      (reason) => !hasControlCharacters(reason),
      "validation.noteSingleLine",
    )
    .optional(),
});

export type TimeOffPayload = z.infer<typeof timeOffPayloadSchema>;

/** The two UTC instants a TimeOff row stores, plus its optional label. */
export type TimeOffRange = {
  startAt: Date;
  endAt: Date;
  reason?: string;
};

/**
 * Turns what the owner picked into the half-open UTC instant range the row
 * stores, or says why it can't.
 *
 * `timezone` must be `tenant.timezone`. Every DateTime column in this schema is
 * a UTC instant with no zone attached (CLAUDE.md), so the conversion happens
 * here, once, at the boundary — the same contract `toWorkingHoursRows` has for
 * wall-clock minutes.
 *
 * ALL-DAY RANGES GO THROUGH localDayWindowUtc RATHER THAN ARITHMETIC HERE. That
 * function already defines the half-open [start of local day, start of next
 * local day) window, and it is what getStaffAvailability bounds its own queries
 * with. Reusing it means a range written by this form and a query that reads it
 * back cannot disagree — and it is DST-correct for free, which hand-rolled
 * `.plus({ days: 1 })` on a local midnight is not: a Berlin day across the
 * spring-forward is 23 hours long, and an all-day absence has to be exactly that
 * day, not 24 hours from its start.
 *
 * Returns a discriminated result rather than throwing: a nonsensical range is
 * something the owner fixes by typing, not an exception.
 */
export function toTimeOffRange(
  payload: TimeOffPayload,
  timezone: string,
): { ok: true; range: TimeOffRange } | { ok: false; message: string } {
  const reason = payload.reason ? payload.reason : undefined;

  const range = payload.allDay
    ? allDayRange(payload, timezone)
    : timedRange(payload, timezone);

  if (!range.ok) return range;

  if (range.endAt <= range.startAt) {
    return {
      ok: false,
      message: payload.allDay
        ? "validation.lastDayBeforeFirst"
        : "validation.endBeforeStart",
    };
  }

  const spanDays =
    (range.endAt.getTime() - range.startAt.getTime()) / (24 * 60 * 60_000);

  if (spanDays > MAX_SPAN_DAYS) {
    return {
      ok: false,
      message: "validation.longerThanYear",
    };
  }

  return { ok: true, range: { startAt: range.startAt, endAt: range.endAt, reason } };
}

type RangeResult =
  | { ok: true; startAt: Date; endAt: Date }
  | { ok: false; message: string };

/**
 * A whole number of calendar days, inclusive of the end date.
 *
 * "Away the 10th to the 12th" means the 12th is not a working day either, so the
 * range runs to the start of the 13th. Half-open, like every other range in this
 * codebase — the exclusion constraint's tsrange, the working-hours windows, and
 * localDayWindowUtc itself all treat adjacency as legal rather than overlapping.
 */
function allDayRange(payload: TimeOffPayload, timezone: string): RangeResult {
  const endDate = payload.endDate || payload.startDate;

  try {
    const { from } = localDayWindowUtc(payload.startDate, timezone);
    const { to } = localDayWindowUtc(endDate, timezone);

    return { ok: true, startAt: from, endAt: to };
  } catch {
    // localDayWindowUtc throws on a date it can't parse. A date input can post
    // an empty or malformed value if the browser lets it through.
    return { ok: false, message: "validation.datesUnreadable" };
  }
}

/**
 * Part of a single day.
 *
 * Deliberately one date rather than a start date and a separate end date: a
 * timed range spanning midnight ("Friday 16:00 until Sunday") is a shape nobody
 * has asked for, and offering it means validating a middle case that reads
 * ambiguously in the list afterwards. All-day mode covers multi-day absences.
 *
 * Times are applied with `.set()` on the local day, never `.plus({ minutes })`,
 * for the reason `toWindow` in slots.ts gives: on a spring-forward day, adding
 * minutes to local midnight lands an hour off the wall clock the owner meant.
 */
function timedRange(payload: TimeOffPayload, timezone: string): RangeResult {
  const start = atLocalTime(payload.startDate, payload.startTime, timezone);
  const end = atLocalTime(payload.startDate, payload.endTime, timezone);

  if (!start || !end) {
    return { ok: false, message: "validation.timesRequired" };
  }

  return { ok: true, startAt: start, endAt: end };
}

/** "2026-08-04" + "14:30" in the shop's zone -> the UTC instant, or null. */
function atLocalTime(
  date: string,
  time: string,
  timezone: string,
): Date | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!match) return null;

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;

  const local = DateTime.fromISO(date, { zone: timezone });
  if (!local.isValid) return null;

  const at = local.set({ hour, minute, second: 0, millisecond: 0 });
  if (!at.isValid) return null;

  return at.toJSDate();
}
