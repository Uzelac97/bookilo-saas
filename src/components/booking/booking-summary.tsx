import { DateTime } from "luxon";

import type { BookingByToken } from "@/lib/db/bookings";
import {
  formatBookingDate,
  formatDuration,
  formatPrice,
  formatSlotTime,
} from "@/lib/format";
import { serviceName } from "@/lib/i18n/service-text";
import type { Translator } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/preferences";

import { SummaryRow } from "./summary-row";

/**
 * What was booked: service, barber, when, how long, how much.
 *
 * The booked and cancel pages both render it from the same BookingByToken, so
 * the two pages describing one appointment cannot drift apart line by line.
 * Every time is shown in the shop's timezone, never the visitor's.
 */
export function BookingSummary({
  booking,
  t,
  locale,
}: {
  booking: BookingByToken;
  t: Translator;
  locale: Locale;
}) {
  const { tenant, service } = booking;
  const date = DateTime.fromJSDate(booking.startAt)
    .setZone(tenant.timezone)
    .toISODate();
  const time = formatSlotTime(booking.startAt, tenant.timezone);

  return (
    <dl className="flex flex-col gap-1.5 rounded-2xl border border-line bg-surface p-5 text-sm shadow-sm">
      <SummaryRow
        label={t("booking.service")}
        value={serviceName(service, locale)}
      />
      <SummaryRow label={t("booking.barber")} value={booking.staff.name} />
      <SummaryRow
        label={t("booking.when")}
        value={
          date
            ? t("booking.dateAtTime", {
                date: formatBookingDate(date, tenant.timezone, locale),
                time,
              })
            : time
        }
      />
      <SummaryRow
        label={t("booking.duration")}
        value={formatDuration(service.durationMinutes, locale)}
      />
      <SummaryRow
        label={t("booking.price")}
        value={formatPrice(service.priceMinorUnits)}
      />
    </dl>
  );
}
