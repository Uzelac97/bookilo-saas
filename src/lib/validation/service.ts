import { z } from "zod";

import { encodeMessage } from "@/lib/i18n/translate";

// Messages are keys into lib/i18n/messages, not prose — see the note in
// ./auth.ts. Tests read them back through the English dictionary.

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
/**
 * Exported so format.test.ts can assert against the real ceiling rather than a
 * copy of the number: formatDuration grew a days tier for the cancellation
 * window, and the claim that no service can ever reach it is only true while
 * this stays under a day. If it's ever raised past 1440, that test fails and
 * says so — which is the point.
 */
export const MAX_DURATION_MINUTES = 480;

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
 * Note this is a *display* concern crossing into validation: prices render
 * pinned to de-DE (lib/format.ts) whatever the interface language, while an
 * owner may type either decimal mark. Accepting both means this function
 * doesn't depend on how the price was last shown.
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

/** A service name's rules — shared by `name` and its optional English twin. */
const serviceName = () =>
  z
    .string()
    .trim()
    .min(2, "validation.serviceNameRequired")
    .max(60, "validation.nameTooLong")
    .refine(
      (name) => !hasControlCharacters(name),
      "validation.nameSingleLineGeneric",
    );

/** A category's rules — shared by `category` and `categoryEn`. */
const categoryText = () =>
  z
    .string()
    .trim()
    .max(40, "validation.categoryTooLong")
    .refine(
      (category) => !hasControlCharacters(category),
      "validation.categorySingleLine",
    );

/**
 * An optional text field: an untouched input becomes undefined rather than an
 * empty string, because each column is nullable and null is what "not set"
 * means to the public pages' fallback (lib/i18n/service-text.ts). A field of
 * spaces counts as untouched.
 *
 * A preprocess rather than `z.union([z.literal(""), field])`: when every branch
 * of a union fails, Zod reports one generic "Invalid input" and the branch's
 * own message key never arrives, so a too-long value would show the owner an
 * untranslated library string.
 */
const optional = <T extends z.ZodType<string>>(field: T) =>
  z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    field.optional(),
  );

/**
 * A service as the owner's form submits it.
 *
 * No `tenantId` and no `id`: the tenant comes from the server-side session
 * (CLAUDE.md rule 2) and the id, when editing, travels as its own field that the
 * write helper scopes by tenant in the same `where` clause. Neither is ordinary
 * form input and neither is accepted here.
 */
export const serviceInputSchema = z
  .object({
    name: serviceName(),
    /**
     * Shown instead of `name` on the public pages when a customer has switched
     * to English. Optional: without it, `name` is shown in both languages.
     */
    nameEn: optional(serviceName()),
    /**
     * Arrives as a string from the form. `coerce` would turn "" into 0 and "abc"
     * into NaN, so this parses explicitly and rejects anything that isn't a whole
     * number of minutes.
     */
    durationMinutes: z
      .string()
      .trim()
      .min(1, "validation.durationRequired")
      .transform((value) => (/^\d+$/.test(value) ? Number(value) : Number.NaN))
      .refine(
        (value) => Number.isInteger(value),
        "validation.durationWhole",
      )
      .refine(
        (value) => value >= MIN_DURATION_MINUTES && value <= MAX_DURATION_MINUTES,
        encodeMessage("validation.durationRange", {
          min: MIN_DURATION_MINUTES,
          maxHours: MAX_DURATION_MINUTES / 60,
        }),
      ),
    /**
     * Typed in euros, stored in cents. The field is named for what the owner
     * types; the transform is what makes the rest of the app's `priceMinorUnits`
     * true.
     */
    priceMinorUnits: z
      .string()
      .trim()
      .min(1, "validation.priceRequired")
      .transform((value) => parsePriceToMinorUnits(value) ?? Number.NaN)
      .refine(
        (value) => Number.isInteger(value),
        "validation.priceFormat",
      )
      .refine(
        (value) => value <= MAX_PRICE_MINOR_UNITS,
        "validation.priceTooHigh",
      ),
    /**
     * A plain grouping label, not a taxonomy (EXECUTION-PLAN.md). Optional, and
     * an untouched field becomes undefined rather than an empty string — the
     * column is nullable and "" would sort as its own group on the public page.
     */
    category: optional(categoryText()),
    /**
     * The category's English label. Grouping stays keyed on `category`; this
     * only relabels the group's heading in English.
     */
    categoryEn: optional(categoryText()),
  })
  // An English label with no category has no group to label — it would be
  // saved and never shown, which is worse than saying so.
  .refine((service) => !(service.categoryEn && !service.category), {
    message: "validation.categoryEnWithoutCategory",
    path: ["categoryEn"],
  });

export type ServiceInput = z.infer<typeof serviceInputSchema>;
