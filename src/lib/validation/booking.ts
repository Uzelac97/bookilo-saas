import { z } from "zod";

import { normalizePhone, phoneDigitCount } from "./phone";

/**
 * The shortest thing that can still be a real phone number, counted in digits
 * rather than characters. Short enough to admit a local number typed without
 * an area code, since rejecting a reachable number is the worse failure here.
 */
const MIN_PHONE_DIGITS = 6;

/**
 * Characters a name may not contain: C0 and C1 control characters, plus the
 * Unicode line and paragraph separators.
 *
 * Rejected rather than stripped, deliberately. A name with a line break in it is
 * a different value from the same name without one — usually a paste that
 * brought a second field along with it — and quietly rewriting what someone
 * typed means the shop calls a customer by a name they never gave. Trailing
 * whitespace is the opposite case and is still trimmed: nobody means to type it.
 *
 * The concrete reason a name has to be a single line: it goes into the subject
 * header of the owner's notification email. That isn't header injection with
 * Resend — the SDK posts JSON to an HTTP API rather than writing SMTP headers,
 * so the transport encodes it — but it does produce a mangled subject, and a
 * value that can't survive being written on one line has no business here.
 */
function hasControlCharacters(value: string): boolean {
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;

    if (
      code <= 0x1f || // C0: tab, newline, carriage return, NUL, …
      (code >= 0x7f && code <= 0x9f) || // DEL and C1
      code === 0x2028 || // line separator
      code === 0x2029 // paragraph separator
    ) {
      return true;
    }
  }

  return false;
}

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
   * hasControlCharacters above for why that last one is a rejection rather than
   * a clean-up. The order matters: `trim` first, so a trailing newline from a
   * paste is removed rather than reported, and the single-line check last, so an
   * empty or over-long field gets the message that actually describes it.
   */
  name: z
    .string()
    .trim()
    .min(2, "Enter your name.")
    .max(80, "That name is too long.")
    .refine(
      (name) => !hasControlCharacters(name),
      "Enter your name on a single line.",
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
    .min(6, "Enter a phone number so the shop can reach you.")
    .max(32, "That phone number is too long.")
    .regex(/^[+\d][\d\s()/.-]*$/, "Enter a valid phone number.")
    .transform(normalizePhone)
    .refine(
      (phone) => phoneDigitCount(phone) >= MIN_PHONE_DIGITS,
      "Enter a phone number so the shop can reach you.",
    ),
  /**
   * Optional, and normalised the same way as the login schema. An empty string
   * from an untouched input becomes undefined rather than failing validation —
   * without this, leaving an optional field blank is an error.
   */
  email: z
    .union([z.literal(""), z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address."))])
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
