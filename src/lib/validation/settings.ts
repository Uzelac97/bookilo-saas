import { z } from "zod";

import { encodeMessage } from "@/lib/i18n/translate";

import { BOOKING_HORIZON_DAYS } from "@/lib/availability/booking-options";

/**
 * Bounds on the three booking rules an owner configures.
 *
 * These are business rules, not input hygiene, so each ceiling is a decision:
 *
 * - `bufferMinutes` widens `blockedUntil` on every new booking and thins real
 *   availability. An hour of dead time between two cuts is already extreme for a
 *   1–5 chair shop, so 60 is the ceiling.
 * - `minLeadMinutes`'s ceiling is load-bearing rather than cosmetic. A customer
 *   can only book `BOOKING_HORIZON_DAYS` ahead, so a lead time approaching that
 *   leaves almost no bookable day and one above it leaves none at all — the
 *   public page would render an entire horizon of empty days with no explanation
 *   of why. A week sits well inside it, which is the relationship the imported
 *   constant below is there to keep honest if the horizon ever moves.
 * - `cancellationWindowMinutes` shares that ceiling for symmetry; a window longer
 *   than the notice a customer had to give to book is incoherent anyway.
 *
 * ZERO IS LEGAL FOR ALL THREE and each zero means something a real shop wants:
 * no gap between appointments (the case scripts/probe-exclusion-constraint.ts
 * asserts must stay bookable), same-day online booking, and "cancel any time".
 */
const MAX_BUFFER_MINUTES = 60;
const MAX_LEAD_MINUTES = 7 * 24 * 60;
const MAX_CANCELLATION_MINUTES = 7 * 24 * 60;

/**
 * Parses one whole-minutes field the way `serviceInputSchema` parses a duration:
 * explicitly, never with `z.coerce`.
 *
 * `coerce` reads "" as 0 and "abc" as NaN. That's wrong everywhere, but it's
 * actively dangerous here because 0 is a *valid* setting for all three fields —
 * an empty box would save as "no buffer, no notice, cancel any time" and look
 * like something the owner chose.
 *
 * NEGATIVES ARE REJECTED BY THE REGEX, not by a floor check. `\d+` cannot match a
 * minus sign, so "-5" fails the pattern, becomes NaN, and comes back as "whole
 * minutes" — the same path as "abc". That's deliberate rather than incidental,
 * and it's why the range refine below only states a ceiling: a `value >= 0` there
 * would be unreachable, and an unreachable guard reads as if it were doing
 * something.
 */
function minutesField(opts: {
  max: number;
  missing: string;
  invalid: string;
  outOfRange: string;
}) {
  return z
    .string()
    .trim()
    .min(1, opts.missing)
    .transform((value) => (/^\d+$/.test(value) ? Number(value) : Number.NaN))
    .refine((value) => Number.isInteger(value), opts.invalid)
    .refine((value) => value <= opts.max, opts.outOfRange);
}

/**
 * The tenant's booking rules, as the settings form submits them.
 *
 * No `tenantId`, for the same reason as `serviceInputSchema`: the tenant comes
 * from the server-side session (CLAUDE.md rule 2) and there is deliberately
 * nowhere here for a client-supplied one to be read from.
 *
 * Only these three columns. `Tenant` also holds slug, name, timezone and contact
 * details; none of them is editable on this screen, and keeping them out of the
 * schema is what makes that structural rather than a matter of which inputs the
 * form happens to render.
 */
export const bookingRulesSchema = z.object({
  bufferMinutes: minutesField({
    max: MAX_BUFFER_MINUTES,
    missing: "validation.bufferMissing",
    invalid: "validation.bufferInvalid",
    outOfRange: encodeMessage("validation.bufferRange", {
      max: MAX_BUFFER_MINUTES,
    }),
  }),
  minLeadMinutes: minutesField({
    max: MAX_LEAD_MINUTES,
    missing: "validation.leadMissing",
    invalid: "validation.leadInvalid",
    outOfRange: encodeMessage("validation.leadRange", {
      maxDays: MAX_LEAD_MINUTES / 60 / 24,
      horizon: BOOKING_HORIZON_DAYS,
    }),
  }),
  cancellationWindowMinutes: minutesField({
    max: MAX_CANCELLATION_MINUTES,
    missing: "validation.windowMissing",
    invalid: "validation.windowInvalid",
    outOfRange: encodeMessage("validation.windowRange", {
      maxDays: MAX_CANCELLATION_MINUTES / 60 / 24,
    }),
  }),
});

export type BookingRulesInput = z.infer<typeof bookingRulesSchema>;
