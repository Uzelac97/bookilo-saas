import { z } from "zod";

// Messages are keys into lib/i18n/messages, not prose — see the note in
// ./auth.ts. Tests read them back through the English dictionary.

import { normalizePhone, phoneDigitCount } from "./phone";
// Moved to ./text.ts on Day 11, when the services and staff screens needed the
// same single-line rule for the names an owner types. Same function, one home.
import { hasControlCharacters } from "./text";

/**
 * The shortest thing that can still be a real phone number, counted in digits
 * rather than characters. Short enough to admit a local number typed without
 * an area code, since rejecting a reachable number is the worse failure here.
 */
const MIN_PHONE_DIGITS = 6;

/**
 * The customer-supplied half of a public booking.
 *
 * Written on Day 6 for the form; Day 7's submission action validates against
 * the same schema, so "valid" has one definition rather than a client-side
 * opinion and a server-side one that drift.
 *
 * Deliberately absent: staffId, serviceId, startAt, and above all tenantId.
 * Those are resolved server-side from the slug and re-verified against the
 * tenant before the insert (CLAUDE.md rules 2 and 2a) — accepting them here
 * would make them look like ordinary form input.
 */
export const customerDetailsSchema = z.object({
  /**
   * Trimmed, length-bounded, and required to be a single line — see
   * hasControlCharacters in ./text.ts for why that last one is a rejection
   * rather than a clean-up. The order matters: `trim` first, so a trailing
   * newline from a paste is removed rather than reported, and the single-line
   * check last, so an empty or over-long field gets the message that actually
   * describes it.
   */
  name: z
    .string()
    .trim()
    .min(2, "validation.nameRequired")
    .max(80, "validation.nameTooLong")
    .refine(
      (name) => !hasControlCharacters(name),
      "validation.nameSingleLine",
    ),
  /**
   * Phone is the identity key for a customer within a tenant
   * (`@@unique([tenantId, phone])`) and the only reliable way a barber can
   * reach someone, so it's required while email isn't.
   *
   * Validated loosely on purpose: these are German-speaking single-location
   * shops taking local numbers in whatever shape the customer types them
   * (+49 30 123, 030/123, 0176-123). A strict E.164 rule would reject valid
   * input from real customers, which is a worse failure than storing a
   * slightly ragged string.
   *
   * Accepted loosely, *stored* canonically: normalizePhone collapses the
   * spacing and punctuation, because this value is the customer identity key
   * and what the per-phone rate limiter counts against — see ./phone.ts for
   * why that matters and what it deliberately doesn't unify.
   *
   * The order of the chain is load-bearing. `min` runs on the raw string so an
   * empty or obviously short field gets the friendly message rather than the
   * regex's; the digit-count check runs after the transform, because
   * "12 () - ." clears a six-character minimum with two digits in it.
   */
  phone: z
    .string()
    .trim()
    .min(6, "validation.phoneRequired")
    .max(32, "validation.phoneTooLong")
    .regex(/^[+\d][\d\s()/.-]*$/, "validation.phoneInvalid")
    .transform(normalizePhone)
    .refine(
      (phone) => phoneDigitCount(phone) >= MIN_PHONE_DIGITS,
      "validation.phoneRequired",
    ),
  /**
   * Optional, and normalised the same way as the login schema. An empty string
   * from an untouched input becomes undefined rather than failing validation —
   * without this, leaving an optional field blank is an error.
   */
  email: z
    .union([z.literal(""), z.string().trim().toLowerCase().pipe(z.email("validation.emailInvalid"))])
    .optional()
    .transform((value) => (value ? value : undefined)),
});

export type CustomerDetails = z.infer<typeof customerDetailsSchema>;

/**
 * The whole public booking request, as it arrives at the submission action.
 *
 * Still no `tenantId`, for the reason above. `slug` is here instead: the action
 * is called from a client component that has no URL of its own, so the slug
 * travels in the payload and the tenant is looked up from it server-side on
 * arrival. That keeps the public resolution path intact (EXECUTION-PLAN.md §3) —
 * the slug names *which shop*, it does not authorize anything, and every id
 * below is re-checked against the tenant it resolves to.
 *
 * `staffId` is required rather than optional. The form has already resolved
 * "any barber" to a concrete id by the time it submits, because it shows the
 * customer that barber's name before they commit — so the id it sends is the one
 * they agreed to, and the action verifies that barber is genuinely free at the
 * chosen instant rather than re-resolving to someone else.
 */
export const bookingSubmissionSchema = customerDetailsSchema.extend({
  slug: z.string().trim().min(1),
  serviceId: z.string().trim().min(1),
  staffId: z.string().trim().min(1),
  /**
   * A UTC instant, serialized by the client as ISO 8601. Parsed to a Date here
   * so nothing downstream handles the string form — and never used as-is: the
   * action re-derives the tenant-local day from it and re-computes whether that
   * instant is actually bookable.
   */
  startAt: z.iso.datetime().pipe(z.coerce.date()),
});

export type BookingSubmission = z.infer<typeof bookingSubmissionSchema>;
