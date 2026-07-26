import { z } from "zod";

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
  name: z
    .string()
    .trim()
    .min(2, "Enter your name.")
    .max(80, "That name is too long."),
  /**
   * Phone is the identity key for a customer within a tenant
   * (`@@unique([tenantId, phone])`) and the only reliable way a barber can
   * reach someone, so it's required while email isn't.
   *
   * Validated loosely on purpose: these are German-speaking single-location
   * shops taking local numbers in whatever shape the customer types them
   * (+49 30 123, 030/123, 0176-123). A strict E.164 rule would reject valid
   * input from real customers, which is a worse failure than storing a
   * slightly ragged string. Normalisation is a Day 8 concern, alongside the
   * per-phone rate limiting that has to compare them.
   */
  phone: z
    .string()
    .trim()
    .min(6, "Enter a phone number so the shop can reach you.")
    .max(32, "That phone number is too long.")
    .regex(/^[+\d][\d\s()/.-]*$/, "Enter a valid phone number."),
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
