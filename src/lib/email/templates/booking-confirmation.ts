import type { BookingByToken } from "@/lib/db/bookings";
import {
  formatCancellationPolicy,
  formatDuration,
  formatPrice,
  formatSlotTime,
} from "@/lib/format";

import {
  EMAIL_LOCALE,
  emailT as t,
  renderHtml,
  renderText,
  type EmailContent,
} from "./shell";
import { localDate } from "./when";

export type RenderedEmail = { subject: string; html: string; text: string };

/**
 * The confirmation a customer gets after booking.
 *
 * Only sent when they gave an email — it's optional on the form, and a booking
 * without one is still a booking. The confirmation page is the other copy of
 * everything below, including the cancel link, which is why that page is a real
 * route and not a panel a refresh would throw away.
 *
 * `cancelUrl` is passed in rather than built here so this stays a pure function
 * of its arguments, with no opinion about environment variables. It's absolute:
 * a relative path in an email goes nowhere.
 */
export function renderBookingConfirmation(
  booking: BookingByToken,
  cancelUrl: string,
): RenderedEmail {
  const { tenant, service } = booking;
  const date = localDate(booking.startAt, tenant.timezone);
  const time = formatSlotTime(booking.startAt, tenant.timezone);
  const firstName = booking.customer.name.split(" ")[0] ?? booking.customer.name;

  const when = t("booking.dateAtTime", { date, time });

  const rows = [
    { label: t("booking.service"), value: service.name },
    { label: t("booking.barber"), value: booking.staff.name },
    { label: t("booking.when"), value: when },
    {
      label: t("booking.duration"),
      value: formatDuration(service.durationMinutes, EMAIL_LOCALE),
    },
    { label: t("booking.price"), value: formatPrice(service.priceMinorUnits) },
  ];

  // Address last, and only when the shop has one on file. A customer who has
  // never been needs it more than anything else here; a nullable column means
  // it can't simply be assumed.
  if (tenant.address) {
    rows.push({ label: t("email.where"), value: tenant.address });
  }

  const footerLines = [
    tenant.phone
      ? t("email.questionsPhone", { shop: tenant.name, phone: tenant.phone })
      : t("email.questions", { shop: tenant.name }),
  ];

  const content: EmailContent = {
    heading: t("booked.heading"),
    lead: t("email.confirmationLead", {
      name: firstName,
      shop: tenant.name,
      service: service.name,
      when,
    }),
    rows,
    action: {
      label: t("booked.cancelLink"),
      url: cancelUrl,
      // This sentence is the promise the shop is held to: it's what a customer
      // reads weeks later when they need to cancel, and the window can have been
      // changed since (it's read live, not snapshotted — see lib/db/tenant.ts).
      hint: formatCancellationPolicy(
        tenant.cancellationWindowMinutes,
        EMAIL_LOCALE,
      ),
    },
    footerLines,
  };

  return {
    // Date and time in the subject on purpose: this is the mail someone digs
    // out of an inbox three weeks later to check when they're due.
    subject: t("email.confirmationSubject", { shop: tenant.name, date, time }),
    html: renderHtml(content),
    text: renderText(content),
  };
}
