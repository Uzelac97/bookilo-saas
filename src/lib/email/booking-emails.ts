import type { BookingByToken } from "@/lib/db/bookings";

import { sendEmail } from "./resend";
import { renderBookingConfirmation } from "./templates/booking-confirmation";
import { renderOwnerNotification } from "./templates/owner-notification";

/**
 * The absolute base URL of this app, for links that leave it.
 *
 * Only emails need this — everything inside the app uses relative paths, which
 * are correct on every environment for free. A link in an email has no origin to
 * be relative to, so it has to be told one.
 *
 * Falls back to localhost rather than throwing, for the same reason sendEmail
 * tolerates a missing key: a misconfigured URL should produce a wrong link in a
 * dev inbox, not a failed booking in production.
 */
function appUrl(): string {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}

/** The cancel link, as the customer receives it. */
export function cancelUrl(slug: string, token: string): string {
  return `${appUrl()}/b/${slug}/cancel/${token}`;
}

/**
 * Sends both booking emails: the customer's confirmation and the owner's alert.
 *
 * Called after the booking is committed and awaited by the caller, per
 * CLAUDE.md. Both halves matter. Awaited, because Vercel kills un-awaited work
 * the moment the response is sent — a fire-and-forget send silently never
 * happens, and it never shows up in a log either. After the commit, because a
 * booking that exists with no email is a recoverable annoyance while an email
 * about a booking that failed to save is a customer turning up to nothing.
 *
 * Never throws. allSettled rather than all, so a failing confirmation doesn't
 * skip the owner's alert — the shop still needs to know someone is coming, and
 * those two sends fail independently (a customer's mailbox rejecting a message
 * says nothing about the owner's).
 *
 * Failures are logged and not retried inline. A retry loop here would hold the
 * customer's request open for a send they're not waiting on, and Resend's own
 * queueing is a better place for it than a serverless function about to exit.
 *
 * `notifyOwner` defaults to true, so the public path is unchanged. The dashboard
 * passes false: the owner is the one who just typed the booking in, and a "new
 * booking" alert about their own keystrokes is the kind of noise that teaches
 * someone to ignore the alert that matters. The customer's confirmation still
 * goes out when they gave an address — a booking taken over the phone for next
 * week is exactly when someone wants the details and the cancel link.
 */
export async function sendBookingEmails(
  booking: BookingByToken,
  ownerEmail: string,
  customerPhone: string,
  options: { notifyOwner?: boolean } = {},
): Promise<void> {
  const { tenant } = booking;
  const url = cancelUrl(tenant.slug, booking.cancelToken);

  const sends: Array<{ label: string; run: () => Promise<void> }> = [];

  // Email is optional on the public form. No address means no confirmation and
  // no cancel link, which the owner's notification says out loud so the shop
  // knows this customer can only change things by phone.
  if (booking.customer.email) {
    const to = booking.customer.email;
    const rendered = renderBookingConfirmation(booking, url);
    sends.push({
      label: "customer confirmation",
      run: async () => {
        const result = await sendEmail({ to, ...rendered });
        if (!result.ok) throw new Error(result.error);
      },
    });
  }

  if (options.notifyOwner ?? true) {
    const ownerMail = renderOwnerNotification(booking, customerPhone);
    sends.push({
      label: "owner notification",
      run: async () => {
        const result = await sendEmail({ to: ownerEmail, ...ownerMail });
        if (!result.ok) throw new Error(result.error);
      },
    });
  }

  const outcomes = await Promise.allSettled(sends.map((send) => send.run()));

  outcomes.forEach((outcome, index) => {
    if (outcome.status === "rejected") {
      // Identified by booking id, never by cancel token — that token is a bearer
      // secret and must not reach a log line.
      console.error(
        `[email] ${sends[index]?.label} failed for booking ${booking.id}:`,
        outcome.reason,
      );
    }
  });
}
