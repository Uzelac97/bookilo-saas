"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { cancelBookingByToken } from "@/lib/db/bookings";

/**
 * The action's arguments, as they actually arrive: untrusted.
 *
 * `slug` and `token` are bound with `.bind()` on the cancel page, but binding is
 * not a protection. An exported Server Action is reachable by direct POST with
 * whatever arguments the caller chooses — only variables a closure captures get
 * encrypted by Next, and this is not a closure. So both are validated here as
 * if they came from a form, and a token that isn't a UUID never reaches Prisma.
 * Tokens are minted by randomUUID() in createBooking, so nothing legitimate
 * fails this.
 */
const cancelArgsSchema = z.object({
  slug: z.string().trim().min(1).max(100),
  token: z.uuid(),
});

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
 * Holding the token *is* the authorization — there is no session on this path.
 * The slug is passed down so a token can only cancel under its own shop's URL,
 * matching the 404 the page itself renders on a mismatch.
 */
export async function cancelBooking(args: { slug: string; token: string }) {
  const parsed = cancelArgsSchema.safeParse(args);
  // Malformed arguments get the same silent outcome as a wrong token: the page
  // re-renders from the row and shows whatever is true.
  if (!parsed.success) return;

  const { slug, token } = parsed.data;

  // The result is deliberately not inspected — see above. It is not logged
  // either: every failure reason here is a normal customer-facing outcome, and
  // the only identifier available to log it against is the token itself, which
  // must never reach a log line.
  await cancelBookingByToken(token, slug, new Date());

  revalidatePath(`/b/${slug}/cancel/${token}`);
}
