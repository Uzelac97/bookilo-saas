/**
 * How a booking status reads to the shop owner.
 *
 * One source, because this was duplicated verbatim in today-list.tsx and
 * calendar-grid.tsx — same four keys, same four strings. Renaming "Done" would
 * have changed one surface and silently left the other, with nothing to catch
 * the drift.
 *
 * Only the words are shared. The two surfaces style a status differently and
 * should: the overview badges it in a row that has space for a pill, the
 * calendar tints a block that may be twenty pixels tall. Those maps stay where
 * they are used.
 *
 * CONFIRMED is null on purpose rather than "Confirmed". It is the overwhelming
 * majority of bookings, and labelling every one of them would bury the two that
 * need attention.
 */
import type { BookingStatus } from "@/lib/db/bookings";

export const STATUS_LABELS: Record<BookingStatus, string | null> = {
  CONFIRMED: null,
  CANCELLED: "Cancelled",
  COMPLETED: "Done",
  NO_SHOW: "No-show",
};
