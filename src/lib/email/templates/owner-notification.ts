import type { BookingByToken } from "@/lib/db/bookings";
import {
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
import type { RenderedEmail } from "./booking-confirmation";
import { localDate } from "./when";

/**
 * The alert an owner gets when someone books online.
 *
 * Written for a barber reading it on a phone between customers, so the
 * customer's name and number come first: the two things needed to act on it —
 * to call and move an appointment, or to recognise a name walking in.
 *
 * No link to the dashboard, because there isn't one until Day 9. That's a
 * deliberate omission rather than an oversight; when the calendar exists, a
 * deep link to the day belongs here.
 */
export function renderOwnerNotification(
  booking: BookingByToken,
  customerPhone: string,
): RenderedEmail {
  const { tenant, service } = booking;
  const date = localDate(booking.startAt, tenant.timezone);
  const time = formatSlotTime(booking.startAt, tenant.timezone);

  const when = t("booking.dateAtTime", { date, time });

  const rows = [
    { label: t("email.customer"), value: booking.customer.name },
    { label: t("book.phone"), value: customerPhone },
  ];

  // Email is optional on the booking form, so its absence is normal and worth
  // stating plainly — an owner seeing no email row would wonder if it was lost.
  rows.push({
    label: t("common.email"),
    value: booking.customer.email ?? t("email.notGiven"),
  });

  rows.push(
    { label: t("booking.service"), value: service.name },
    { label: t("booking.barber"), value: booking.staff.name },
    { label: t("booking.when"), value: when },
    {
      label: t("booking.duration"),
      value: formatDuration(service.durationMinutes, EMAIL_LOCALE),
    },
    { label: t("booking.price"), value: formatPrice(service.priceMinorUnits) },
  );

  const content: EmailContent = {
    heading: t("email.ownerHeading"),
    lead: t("email.ownerLead", {
      customer: booking.customer.name,
      service: service.name,
      barber: booking.staff.name,
      when,
    }),
    rows,
    footerLines: [
      booking.customer.email
        ? t("email.ownerCustomerNotified")
        : t("email.ownerCustomerNoEmail"),
    ],
  };

  return {
    subject: t("email.ownerSubject", {
      customer: booking.customer.name,
      when,
    }),
    html: renderHtml(content),
    text: renderText(content),
  };
}
