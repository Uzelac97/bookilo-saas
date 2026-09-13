"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getCurrentTenant } from "@/lib/auth/session";
import { localInstant } from "@/lib/dashboard/manual-booking";
import {
  createBooking,
  getBookingByCancelToken,
} from "@/lib/db/bookings";
import { findOrCreateCustomer } from "@/lib/db/customers";
import { sendBookingEmails } from "@/lib/email/booking-emails";
import {
  manualBookingSchema,
  type ManualBooking,
} from "@/lib/validation/manual-booking";

/**
 * What the manual booking form renders after a submit.
 *
 * There is no `slot_taken` / `staff_taken` split here, unlike the public action.
 * That distinction exists because a customer needs to know whether to pick
 * another time or another barber; an owner is looking at the calendar and
 * already knows — what they need is which appointment is in the way, which
 * `taken` says plainly.
 *
 * Only async functions may be exported (CLAUDE.md). Types are erased, so they're
 * safe; the initial state lives in the client component.
 */
export type ManualBookingState =
  | { status: "idle" }
  | { status: "invalid"; fieldErrors: ManualBookingFieldErrors }
  | { status: "taken" }
  | { status: "impossible_time" }
  | { status: "error" };

export type ManualBookingFieldErrors = Partial<
  Record<keyof ManualBooking, string>
>;

/**
 * Records a booking the owner is entering by hand.
 *
 * DELIBERATELY DOES NOT RE-COMPUTE AVAILABILITY, and that is the difference
 * between this and submitBooking. The public action's step 5 exists because a
 * customer's payload is untrusted — it re-derives the open slots and requires
 * the requested instant to be among them, or a hand-crafted request books 03:00
 * on a closed Sunday. Here the owner IS the shop: booking 18:05 when the shift
 * ends at 18:00 is a decision they're allowed to make, and the page has already
 * shown them what's unusual about it (describeConflicts).
 *
 * What still holds is the one rule that isn't the owner's to waive: two people
 * cannot have the same barber at the same time. That is enforced by the
 * `no_overlapping_bookings` exclusion constraint in the database, which
 * createBooking surfaces as SLOT_TAKEN — not by a check in this file. A second
 * implementation of the overlap rule in application code would be a second thing
 * to keep in step with the constraint, and only one of the two holds under
 * concurrency.
 *
 * Not rate-limited, unlike the public path: that guards an unauthenticated form
 * against an unbounded number of submissions, and an authenticated owner filling
 * in their own calendar is not the threat model.
 */
export async function createManualBooking(
  _prevState: ManualBookingState,
  formData: FormData,
): Promise<ManualBookingState> {
  // The tenant comes from the session — never from the form (CLAUDE.md rule 2).
  // getCurrentTenant rather than requireSession, because the timezone is needed
  // to turn the typed wall clock into an instant.
  const tenant = await getCurrentTenant();

  const parsed = manualBookingSchema.safeParse({
    staffId: formData.get("staffId"),
    serviceId: formData.get("serviceId"),
    date: formData.get("date"),
    time: formData.get("time"),
    name: formData.get("name"),
    phone: formData.get("phone"),
    email: formData.get("email"),
  });

  if (!parsed.success) {
    const fieldErrors: ManualBookingFieldErrors = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0] as keyof ManualBooking;
      fieldErrors[field] ??= issue.message;
    }

    return { status: "invalid", fieldErrors };
  }

  const { staffId, serviceId, date, time, ...customer } = parsed.data;

  // The typed wall clock becomes a UTC instant here, at the boundary, using the
  // tenant's zone — the only place in this flow that conversion happens. Null
  // means the owner typed a local time that doesn't exist: the spring-forward
  // gap, where Luxon would otherwise silently shift the booking an hour later.
  const startAt = localInstant(date, time, tenant.timezone);
  if (!startAt) return { status: "impossible_time" };

  let token: string;

  try {
    // Resolves to the existing customer when this phone has booked here before,
    // matching on the normalised value the schema produced — so a walk-in the
    // owner types in is the same person as their online bookings.
    const { id: customerId } = await findOrCreateCustomer(tenant.id, customer);

    // createBooking re-verifies that the staff, service and customer all belong
    // to this tenant and are active (rule 2a), and owns the endAt/blockedUntil
    // arithmetic and the cancel token.
    const result = await createBooking({
      tenantId: tenant.id,
      staffId,
      serviceId,
      customerId,
      startAt,
      // The whole reason BookingSource exists. It separates what the shop's own
      // page brought in from what the owner wrote up by hand — the first number
      // anyone will want when asking whether this software is earning its keep.
      source: "MANUAL",
    });

    if (!result.ok) return { status: "taken" };

    token = result.booking.cancelToken;
  } catch (error) {
    // createBooking throws on a foreign key that isn't this tenant's, or on a
    // barber or service that has been deactivated since the form was rendered.
    console.error("createManualBooking failed", error);
    return { status: "error" };
  }

  // Emails, after the booking is committed and never before it. Awaited inside
  // its own try/catch, per CLAUDE.md: un-awaited work is killed the moment
  // Vercel sends the response, and a failed send must never fail the booking.
  //
  // notifyOwner: false — the owner just typed this in. Their own keystrokes are
  // not news, and an alert that's usually noise is an alert that gets ignored.
  try {
    const committed = await getBookingByCancelToken(token, new Date());
    if (committed) {
      await sendBookingEmails(committed, tenant.contactEmail, customer.phone, {
        notifyOwner: false,
      });
    }
  } catch (error) {
    console.error("manual booking emails failed", error);
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/calendar");

  // Outside the try: redirect() signals by throwing. Landing on the calendar for
  // the booked day rather than back on an empty form, because the question an
  // owner has immediately after writing one in is what the day now looks like.
  redirect(`/dashboard/calendar?date=${date}`);
}
