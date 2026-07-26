"use server";

import { revalidatePath } from "next/cache";

import { cancelBookingByToken } from "@/lib/db/bookings";

/**
 * Cancels the booking this page is showing.
 *
 * Returns nothing on purpose. Every outcome this can produce — cancelled, too
 * late, no longer cancellable — is something the page already derives from the
 * booking's own row when it renders, so reporting them twice would give the
 * customer two sources of truth that can disagree. The revalidate below is what
 * turns the result into what they see.
 *
 * That revalidate is required, not defensive: a Server Action that doesn't call
 * it sends back only its return value and never re-invokes the page's server
 * component — measured on Day 6 and written up in booking-flow.tsx. Without it,
 * pressing "Cancel appointment" would leave the page insisting the booking is
 * still confirmed.
 *
 * `slug` and `token` arrive as bound arguments rather than hidden form fields.
 * Not for secrecy — the token is a bearer secret the customer legitimately holds
 * and anyone can POST any token; holding it *is* the authorization. It's so the
 * revalidated path can't be steered somewhere else by editing the form.
 */
export async function cancelBooking(args: { slug: string; token: string }) {
  const { slug, token } = args;

  // The result is deliberately not inspected — see above. It is not logged
  // either: every failure reason here is a normal customer-facing outcome, and
  // the only identifier available to log it against is the token itself, which
  // must never reach a log line.
  await cancelBookingByToken(token, new Date());

  revalidatePath(`/b/${slug}/cancel/${token}`);
}
