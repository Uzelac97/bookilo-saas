import { z } from "zod";

import { hasControlCharacters } from "./text";

/**
 * Bounds on a service's length. The floor keeps a typo'd `0` or `1` out of the
 * slot grid, where a zero-length service makes computeSlots throw; the ceiling
 * is a whole working day, past which the value is far more likely to be a
 * mis-keyed price than a real appointment.
 *
 * Deliberately NOT required to be a multiple of SLOT_STEP_MINUTES. Candidate
 * start times advance on a fixed 15-minute grid regardless of service length
 * (lib/availability/slots.ts), so a 20-minute beard trim — which the demo shop
 * actually sells — is valid and computes correctly.
 */
const MIN_DURATION_MINUTES = 5;
const MAX_DURATION_MINUTES = 480;

/** A price ceiling, in cents, that no barbershop service will reach honestly. */
const MAX_PRICE_MINOR_UNITS = 100_000;

/**
 * Parses what an owner types into a price field, in euros, to the cents the
 * schema stores.
 *
 * Accepts both decimal marks. `formatPrice` in lib/format.ts renders `de-DE`, so
 * the field displays "25,00" and an owner correcting it types a comma back —
 * rejecting the separator they were just shown would be its own bug. A dot is
 * accepted for the same reason in reverse: a keyboard's numeric pad has one.
 *
 * Returns null rather than throwing, so the caller owns the message. Null means
 * "not a price", which covers an empty field, letters, more than one separator,
 * and more than two decimal places — that last one because "25,005" is a typo,
 * and silently rounding it writes a price nobody chose.
 *
 * Note this is a *display* concern crossing into validation, and it inherits the
 * open locale question recorded for Day 13 in EXECUTION-PLAN.md: money is pinned
 * to de-DE while dates follow the runtime. Accepting both marks means this
 * function stays correct whichever way that is settled.
 */
export function parsePriceToMinorUnits(input: string): number | null {
  const trimmed = input.trim();
  if (trimmed === "") return null;

  // Thousands separators are not accepted: "1.250" is ambiguous between 1250 €
  // and 1,25 € across the two locales this field straddles, and no service costs
  // enough to need one.
  const match = /^(\d+)(?:[.,](\d{1,2}))?$/.exec(trimmed);
  if (!match) return null;

  const euros = Number(match[1]);
  // "25,5" means 25,50 — pad rather than parse, so a single decimal digit isn't
  // read as five cents.
  const cents = Number((match[2] ?? "").padEnd(2, "0"));

  if (!Number.isSafeInteger(euros) || !Number.isSafeInteger(cents)) return null;

  return euros * 100 + cents;
}

/**
 * A service as the owner's form submits it.
 *
 * No `tenantId` and no `id`: the tenant comes from the server-side session
 * (CLAUDE.md rule 2) and the id, when editing, travels as its own field that the
 * write helper scopes by tenant in the same `where` clause. Neither is ordinary
 * form input and neither is accepted here.
 */
export const serviceInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Enter a name for this service.")
    .max(60, "That name is too long.")
    .refine(
      (name) => !hasControlCharacters(name),
      "Enter the name on a single line.",
    ),
  /**
   * Arrives as a string from the form. `coerce` would turn "" into 0 and "abc"
   * into NaN, so this parses explicitly and rejects anything that isn't a whole
   * number of minutes.
   */
  durationMinutes: z
    .string()
    .trim()
    .min(1, "Enter how long this takes.")
    .transform((value) => (/^\d+$/.test(value) ? Number(value) : Number.NaN))
    .refine(
      (value) => Number.isInteger(value),
      "Enter the length in whole minutes.",
    )
    .refine(
      (value) => value >= MIN_DURATION_MINUTES && value <= MAX_DURATION_MINUTES,
      `Length must be between ${MIN_DURATION_MINUTES} minutes and ${MAX_DURATION_MINUTES / 60} hours.`,
    ),
  /**
   * Typed in euros, stored in cents. The field is named for what the owner
   * types; the transform is what makes the rest of the app's `priceMinorUnits`
   * true.
   */
  priceMinorUnits: z
    .string()
    .trim()
    .min(1, "Enter a price.")
    .transform((value) => parsePriceToMinorUnits(value) ?? Number.NaN)
    .refine(
      (value) => Number.isInteger(value),
      "Enter a price like 25 or 25,50.",
    )
    .refine(
      (value) => value <= MAX_PRICE_MINOR_UNITS,
      "That price looks too high — check the decimal point.",
    ),
  /**
   * A plain grouping label, not a taxonomy (EXECUTION-PLAN.md). Optional, and an
   * untouched field becomes undefined rather than an empty string — the column
   * is nullable and "" would sort as its own group on the public page.
   */
  category: z
    .union([
      z.literal(""),
      z
        .string()
        .trim()
        .max(40, "That category name is too long.")
        .refine(
          (category) => !hasControlCharacters(category),
          "Enter the category on a single line.",
        ),
    ])
    .optional()
    .transform((value) => (value ? value : undefined)),
});

export type ServiceInput = z.infer<typeof serviceInputSchema>;
