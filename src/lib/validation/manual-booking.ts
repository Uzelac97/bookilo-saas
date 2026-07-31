import { z } from "zod";

import { customerDetailsSchema } from "./booking";

/**
 * A booking the owner is entering by hand — a walk-in, or one taken over the
 * phone.
 *
 * Built on customerDetailsSchema rather than beside it, so the customer half is
 * validated identically on both paths. That matters more here than it looks: the
 * phone is normalised by that schema, and the normalised value is the tenant's
 * customer identity key (`@@unique([tenantId, phone])`). A dashboard booking
 * that validated the phone differently would create a second customer row for
 * someone who already books online, and the shop would see one person as two.
 *
 * NO `tenantId`, and unlike the public schema no `slug` either. The dashboard
 * resolves the tenant from the server-side session and nothing else (CLAUDE.md
 * rule 2) — there is deliberately nowhere in this shape for one to arrive.
 *
 * `date` and `time` rather than the public schema's single `startAt` instant.
 * The owner types a wall clock, and the conversion to a UTC instant needs the
 * tenant's timezone, which is a server-side fact — so the two travel separately
 * and `localInstant` combines them on arrival. Sending an instant would mean the
 * browser deciding the shop's timezone, which is exactly the bug formatSlotTime
 * documents on the display side.
 */
export const manualBookingSchema = customerDetailsSchema.extend({
  staffId: z.string().trim().min(1),
  serviceId: z.string().trim().min(1),
  /** A tenant-local calendar day, "2026-07-29". */
  date: z.iso.date(),
  /**
   * A tenant-local wall clock, "14:30". Only shape-checked here: whether that
   * time exists on that day in that zone is a timezone question, and it's
   * answered by localInstant in lib/dashboard/manual-booking.ts.
   */
  time: z
    .string()
    .trim()
    .regex(/^\d{1,2}:\d{2}$/, "Enter a time like 14:30."),
});

export type ManualBooking = z.infer<typeof manualBookingSchema>;
