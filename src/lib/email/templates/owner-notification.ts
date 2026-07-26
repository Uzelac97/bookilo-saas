import type { BookingByToken } from "@/lib/db/bookings";
import {
  formatDuration,
  formatPrice,
  formatSlotTime,
} from "@/lib/format";

import { renderHtml, renderText, type EmailContent } from "./shell";
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

  const rows = [
    { label: "Customer", value: booking.customer.name },
    { label: "Phone", value: customerPhone },
  ];

  // Email is optional on the booking form, so its absence is normal and worth
  // stating plainly — an owner seeing no email row would wonder if it was lost.
  rows.push({
    label: "Email",
    value: booking.customer.email ?? "not given",
  });

  rows.push(
    { label: "Service", value: service.name },
    { label: "Barber", value: booking.staff.name },
    { label: "When", value: `${date} at ${time}` },
    { label: "Duration", value: formatDuration(service.durationMinutes) },
    { label: "Price", value: formatPrice(service.priceMinorUnits) },
  );

  const content: EmailContent = {
    heading: "New booking",
    lead: `${booking.customer.name} booked ${service.name} with ${booking.staff.name} on ${date} at ${time}.`,
    rows,
    footerLines: [
      booking.customer.email
        ? "The customer has been sent a confirmation with a cancellation link."
        : "No email was given, so the customer has no confirmation and no cancellation link — they'll need to call to change anything.",
    ],
  };

  return {
    subject: `New booking: ${booking.customer.name}, ${date} at ${time}`,
    html: renderHtml(content),
    text: renderText(content),
  };
}
