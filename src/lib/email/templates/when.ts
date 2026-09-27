import { DateTime } from "luxon";

import { formatBookingDate, formatSlotTime } from "@/lib/format";

import { EMAIL_LOCALE } from "./shell";

/**
 * A booking instant as the shop's calendar day: "Di, 28. Jul".
 *
 * lib/format has formatBookingDate, but it takes the ISO date string the URL
 * already carries. An email starts from the instant instead, so the tenant-local
 * day has to be derived first — and doing that inline in each template is how
 * one of them ends up rendering the browser's day, or the server's.
 *
 * Falls back to the time alone rather than throwing: an email that says less
 * than intended still arrives, and a confirmation that fails to send because a
 * date wouldn't format is a worse outcome than a slightly thinner one.
 */
export function localDate(instant: Date, timezone: string): string {
  const date = DateTime.fromJSDate(instant).setZone(timezone).toISODate();

  return date
    ? formatBookingDate(date, timezone, EMAIL_LOCALE)
    : formatSlotTime(instant, timezone);
}
