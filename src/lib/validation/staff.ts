import { z } from "zod";

// Messages are keys into lib/i18n/messages, not prose — see the note in
// ./auth.ts. Tests read them back through the English dictionary.

import { hasControlCharacters } from "./text";

/** Minutes in a day. An interval may end at 24:00 but never start there. */
const MINUTES_PER_DAY = 24 * 60;

/**
 * Turns an `<input type="time">` value into minutes from midnight.
 *
 * "24:00" is accepted as a closing time even though the input can't produce it,
 * because `atLocalMinute` in lib/availability/slots.ts already handles it as the
 * start of the next local day — a shift that runs to midnight is a real one, and
 * rejecting it here would make the schema stricter than the slot math.
 *
 * Returns null rather than throwing: the caller owns the message.
 */
export function parseTimeToMinutes(input: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(input.trim());
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  if (minutes > 59) return null;

  const total = hours * 60 + minutes;

  return total <= MINUTES_PER_DAY ? total : null;
}

/**
 * One interval of one weekday, as the hours editor posts it.
 *
 * Overnight shifts are rejected rather than split across two days. `toWindow` in
 * lib/availability/slots.ts returns null for a backwards window, so a row like
 * that would silently contribute no slots at all — a barber whose hours are on
 * screen but who is bookable nowhere. Better to refuse it at the form.
 */
export const workingHoursRowSchema = z
  .object({
    dayOfWeek: z
      .number()
      .int()
      .min(0, "validation.dayUnknown")
      .max(6, "validation.dayUnknown"),
    startMinute: z.number().int().min(0).max(MINUTES_PER_DAY),
    endMinute: z.number().int().min(0).max(MINUTES_PER_DAY),
  })
  .refine(
    (row) => row.startMinute < row.endMinute,
    "validation.intervalOrder",
  );

export type WorkingHoursRowInput = z.infer<typeof workingHoursRowSchema>;

/**
 * A barber's whole week, as one save.
 *
 * The editor always posts the complete set and `replaceWorkingHours` swaps it
 * wholesale, so an empty array is valid and means "not working this week" —
 * which is how a shop closes a chair without deactivating the person.
 *
 * OVERLAP IS REJECTED, and that is the rule this schema exists for. A day can
 * legitimately hold several rows — a lunch break is two windows, and
 * `slotsForStaff` iterates every matching row — but it iterates them
 * independently and concatenates the results. Two windows that overlap therefore
 * emit the same start time twice, which reaches the public slot grid as a
 * duplicated button and the merge in booking-options.ts as a barber listed twice
 * for one slot. Touching intervals (13:00–14:00 and 14:00–18:00) are fine and
 * stay legal: they're adjacent, not overlapping, exactly as the half-open ranges
 * everywhere else in this codebase treat adjacency.
 */
export const workingHoursSchema = z
  .array(workingHoursRowSchema)
  .max(21, "validation.intervalsTooMany")
  .refine((rows) => !hasOverlap(rows), {
    message: "validation.intervalsOverlap",
  });

/** True when any two rows on the same weekday cover a shared minute. */
function hasOverlap(rows: WorkingHoursRowInput[]): boolean {
  const byDay = new Map<number, WorkingHoursRowInput[]>();

  for (const row of rows) {
    const day = byDay.get(row.dayOfWeek) ?? [];
    day.push(row);
    byDay.set(row.dayOfWeek, day);
  }

  for (const day of byDay.values()) {
    const sorted = [...day].sort((a, b) => a.startMinute - b.startMinute);

    for (let i = 1; i < sorted.length; i += 1) {
      // Half-open: `<` rather than `<=`, so 13:00–14:00 followed by 14:00–18:00
      // is adjacency and passes.
      if (sorted[i].startMinute < sorted[i - 1].endMinute) return true;
    }
  }

  return false;
}

/**
 * The raw shape the hours editor posts, before wall-clock strings become minutes.
 *
 * The editor is a client component holding a week in state, so it serializes the
 * whole thing into one hidden JSON field rather than trying to align parallel
 * `getAll()` arrays — with a variable number of intervals per day, an alignment
 * bug there would silently give someone else's shift to the wrong day.
 */
export const workingHoursPayloadSchema = z.array(
  z.object({
    dayOfWeek: z.number().int().min(0).max(6),
    start: z.string(),
    end: z.string(),
  }),
);

export type WorkingHoursPayload = z.infer<typeof workingHoursPayloadSchema>;

/**
 * Turns the posted week into the rows `replaceWorkingHours` stores, or says why
 * it can't.
 *
 * The single entry point for that conversion, so the action stays thin and the
 * rules — parseable times, forward intervals, no overlap within a day — are
 * asserted in one testable place rather than spread across a form handler.
 */
export function toWorkingHoursRows(
  payload: WorkingHoursPayload,
):
  | { ok: true; rows: { dayOfWeek: number; startMinute: number; endMinute: number }[] }
  | { ok: false; message: string } {
  const rows = [];

  for (const entry of payload) {
    const startMinute = parseTimeToMinutes(entry.start);
    const endMinute = parseTimeToMinutes(entry.end);

    if (startMinute === null || endMinute === null) {
      return { ok: false, message: "validation.intervalIncomplete" };
    }

    rows.push({ dayOfWeek: entry.dayOfWeek, startMinute, endMinute });
  }

  const parsed = workingHoursSchema.safeParse(rows);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "validation.hoursInvalid",
    };
  }

  return { ok: true, rows: parsed.data };
}

/**
 * A barber as the owner's form submits them.
 *
 * No `tenantId` and no `id`, for the same reason as serviceInputSchema: the
 * tenant comes from the session and the id is scoped by the write helper.
 */
export const staffInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "validation.staffNameRequired")
    .max(60, "validation.nameTooLong")
    .refine(
      (name) => !hasControlCharacters(name),
      "validation.nameSingleLineGeneric",
    ),
  /**
   * A pasted link, not an upload — there is no file storage in the MVP and
   * adding one is a dependency decision, not a detail.
   *
   * Required to be http(s) specifically: `z.url()` alone accepts `javascript:`
   * and `data:`, and this value is rendered straight into an `<img src>` on the
   * public page.
   */
  photoUrl: z
    .union([
      z.literal(""),
      z
        .string()
        .trim()
        .max(500, "validation.linkTooLong")
        .pipe(z.url("validation.linkHttps"))
        .refine(
          (url) => /^https?:\/\//i.test(url),
          "validation.linkHttps",
        ),
    ])
    .optional()
    .transform((value) => (value ? value : undefined)),
});

export type StaffInput = z.infer<typeof staffInputSchema>;
