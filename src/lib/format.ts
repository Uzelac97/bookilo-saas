/**
 * Display formatting for the values the booking flow shows a customer.
 *
 * Pure and side-effect free — safe to call from server and client components.
 *
 * Most of this file is timezone-free by nature (money, durations, wall-clock
 * offsets). The two functions at the bottom are not: they render real instants,
 * and they take the tenant's zone explicitly for the reason spelled out there.
 */
import { DateTime } from "luxon";

/**
 * Prices are stored as EUR cents (schema.prisma) and every tenant is a
 * German-speaking single-location shop for now, so locale and currency are
 * module constants rather than Tenant columns. When a real customer needs
 * something else, that's a deliberate two-column migration — not a field added
 * "in case" (CLAUDE.md).
 */
const PRICE_LOCALE = "de-DE";
const PRICE_CURRENCY = "EUR";

// Constructing an Intl.NumberFormat is the expensive part; reuse one.
const priceFormatter = new Intl.NumberFormat(PRICE_LOCALE, {
  style: "currency",
  currency: PRICE_CURRENCY,
});

/** 2500 -> "25,00 €" */
export function formatPrice(minorUnits: number): string {
  return priceFormatter.format(minorUnits / 100);
}

/**
 * A price as the owner's edit field shows it: 2500 -> "25,00".
 *
 * The inverse of parsePriceToMinorUnits in lib/validation/service.ts, minus the
 * currency symbol — an input with "€" sitting inside it is a character the
 * parser then has to strip back out, and a value the owner has to type around.
 *
 * Comma rather than dot, to match formatPrice above: the same number must not
 * change shape between the row that displays it and the field that edits it.
 * The parser accepts both marks, so nothing breaks if this is ever repinned.
 */
export function formatPriceInput(minorUnits: number): string {
  return (minorUnits / 100).toFixed(2).replace(".", ",");
}

/** 30 -> "30 min", 60 -> "1 h", 75 -> "1 h 15 min" */
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;

  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;

  return remainder === 0 ? `${hours} h` : `${hours} h ${remainder} min`;
}

/**
 * Minutes from midnight -> 24-hour wall clock: 540 -> "09:00".
 *
 * Takes a wall-clock offset, not an instant, so there is no timezone involved
 * and nothing here to get wrong across DST. Rendering an actual booking time
 * is a different job and goes through Luxon with the tenant's zone.
 */
export function formatMinuteOfDay(minute: number): string {
  const hours = Math.floor(minute / 60);
  const minutes = minute % 60;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

/**
 * A slot instant as the shop's wall clock: 2026-07-28T12:30Z -> "14:30" in Berlin.
 *
 * `timezone` is required, never defaulted, and must be `tenant.timezone`. These
 * run in client components too, where Luxon would otherwise fall back to the
 * *browser's* zone — a customer booking from another country would then be
 * shown times that don't exist at the shop, pick one, and get a booking an hour
 * off. Passing the zone explicitly is what makes that impossible to forget.
 */
export function formatSlotTime(instant: Date, timezone: string): string {
  return DateTime.fromJSDate(instant).setZone(timezone).toFormat("HH:mm");
}

/**
 * An appointment's span as the shop's wall clock: "09:00–09:30".
 *
 * En dash, not a hyphen — this is a range, and it sits next to names and service
 * labels where a hyphen reads as part of a word.
 *
 * Same `timezone` contract as formatSlotTime above, which this is built on: it
 * is required and must be tenant.timezone. A dashboard render is server-side
 * today, but nothing stops a future client component importing this, and that is
 * exactly where an implicit zone would start showing the wrong hour.
 */
export function formatTimeRange(
  start: Date,
  end: Date,
  timezone: string,
): string {
  return `${formatSlotTime(start, timezone)}–${formatSlotTime(end, timezone)}`;
}

/**
 * A tenant-local calendar day for display: "2026-07-28" -> "Tue, 28 Jul".
 *
 * Takes the ISO date string the URL carries, not an instant, so there is no
 * conversion here to get wrong — but it still needs the zone to construct the
 * day, since `DateTime.fromISO` would otherwise anchor it to the local one.
 */
export function formatBookingDate(date: string, timezone: string): string {
  return DateTime.fromISO(date, { zone: timezone }).toFormat("ccc, d LLL");
}

/**
 * A span of tenant-local calendar days for a heading: "27 Jul – 2 Aug".
 *
 * Collapses the repeated month when both ends share one — "27 – 31 Jul" rather
 * than "27 Jul – 31 Jul". Same en dash as formatTimeRange, and for the same
 * reason: it's a range, and a hyphen next to a month abbreviation reads as a
 * hyphenated word.
 */
export function formatDateRange(
  fromDate: string,
  toDate: string,
  timezone: string,
): string {
  const from = DateTime.fromISO(fromDate, { zone: timezone });
  const to = DateTime.fromISO(toDate, { zone: timezone });

  const sameMonth = from.hasSame(to, "month") && from.hasSame(to, "year");

  return sameMonth
    ? `${from.toFormat("d")} – ${to.toFormat("d LLL")}`
    : `${from.toFormat("d LLL")} – ${to.toFormat("d LLL")}`;
}

/**
 * A person's initials: "Marco Rossi" -> "MR", "Marco" -> "M".
 *
 * First and last, not first-two, so "Jean Luc Picard" reads JP rather than JL.
 *
 * Split with Array.from rather than by index, because `name[0]` on a name
 * beginning outside the basic plane returns half a surrogate pair and renders as
 * a replacement character — a real risk on a field a shop owner types freely.
 */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";

  const first = Array.from(parts[0])[0] ?? "";
  const last =
    parts.length > 1 ? (Array.from(parts[parts.length - 1])[0] ?? "") : "";

  return (first + last).toUpperCase();
}

/** The parts a date-strip cell shows: "Tue" over "28". */
export function formatStripDay(
  date: string,
  timezone: string,
): { weekday: string; dayOfMonth: string } {
  const local = DateTime.fromISO(date, { zone: timezone });

  return {
    weekday: local.toFormat("ccc"),
    dayOfMonth: local.toFormat("d"),
  };
}
