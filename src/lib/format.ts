/**
 * Display formatting for the values the booking flow shows a customer.
 *
 * Pure and side-effect free — safe to call from server and client components.
 */

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
