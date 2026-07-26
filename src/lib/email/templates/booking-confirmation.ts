import type { BookingByToken } from "@/lib/db/bookings";
import { formatDuration, formatPrice, formatSlotTime } from "@/lib/format";

import { renderHtml, renderText, type EmailContent } from "./shell";
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

  const rows = [
    { label: "Service", value: service.name },
    { label: "Barber", value: booking.staff.name },
    { label: "When", value: `${date} at ${time}` },
    { label: "Duration", value: formatDuration(service.durationMinutes) },
    { label: "Price", value: formatPrice(service.priceMinorUnits) },
  ];

  // Address last, and only when the shop has one on file. A customer who has
  // never been needs it more than anything else here; a nullable column means
  // it can't simply be assumed.
  if (tenant.address) rows.push({ label: "Where", value: tenant.address });

  const footerLines = [
    tenant.phone
      ? `Questions? Call ${tenant.name} on ${tenant.phone}.`
      : `Questions? Get in touch with ${tenant.name}.`,
  ];

  const content: EmailContent = {
    heading: "You're booked in",
    lead: `Thanks ${firstName} — ${tenant.name} has you down for ${service.name} on ${date} at ${time}.`,
    rows,
    action: {
      label: "Cancel this booking",
      url: cancelUrl,
      hint: `You can cancel online up to ${formatDuration(tenant.cancellationWindowMinutes)} before your appointment.`,
    },
    footerLines,
  };

  return {
    // Date and time in the subject on purpose: this is the mail someone digs
    // out of an inbox three weeks later to check when they're due.
    subject: `Your appointment at ${tenant.name} — ${date}, ${time}`,
    html: renderHtml(content),
    text: renderText(content),
  };
}
