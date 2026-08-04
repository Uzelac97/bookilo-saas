/**
 * Display formatting for the values the booking flow shows a customer.
 *
 * Pure and side-effect free — safe to call from server and client components.
 *
 * Part of this file is timezone-free by nature (money, durations, wall-clock
 * offsets). The rest renders real days and instants, takes the tenant's zone
 * explicitly for the reason spelled out at each one, and renders in a pinned
 * locale — see DATE_LOCALE below for why neither is left to the runtime.
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

/**
 * The locale every date and time in this file is rendered in.
 *
 * PINNED, AND THAT IS THE WHOLE POINT. Until Day 13 the Luxon calls below passed
 * no locale at all, so weekday and month names came out in whatever the runtime
 * happened to default to, while money three lines above was pinned to de-DE. The
 * inconsistency was the thing worth settling — not whether English abbreviations
 * are acceptable.
 *
 * It is settled by pinning both, not by unpinning either. A confirmation email
 * renders on a server and quotes a date to a customer as a promise; that string
 * must not depend on which region a function booted in, on an LC_ALL somewhere,
 * or on a future self-hosted box. Vercel's Node runtime has historically
 * defaulted to en-US, which is why this was latent rather than visible — latent
 * is not the same as decided.
 *
 * THE TWO VALUES DIFFER ON PURPOSE, and they answer different questions. Money
 * is German because the money is German — these are euro prices at
 * German-speaking shops. Prose is English because every word this product says
 * is English, starting with WEEKDAY_LABELS in lib/availability/opening-hours.ts,
 * which is a hand-written English list rendered by the public hours table, the
 * staff list and the hours editor. German month names beside an English
 * "Monday" column would be a worse inconsistency than the one this replaces.
 *
 * en-GB rather than en-US: the format tokens below are day-first ("d LLL"), and
 * that is the convention en-GB names. The two produce identical output for every
 * token used here — the ordering lives in the token strings, not the locale —
 * so this is a statement of intent that costs nothing today and is right the day
 * a token changes.
 */
const DATE_LOCALE = "en-GB";

/**
 * A UTC instant as a tenant-local DateTime, in the pinned locale.
 *
 * Every function below goes through this or its sibling rather than calling
 * Luxon directly, so a new formatter cannot forget the locale — which is
 * precisely how the old inconsistency arose one function at a time.
 */
function localFromInstant(instant: Date, timezone: string): DateTime {
  return DateTime.fromJSDate(instant).setZone(timezone).setLocale(DATE_LOCALE);
}

/** The same, from the ISO date string a URL carries. */
function localFromISODate(date: string, timezone: string): DateTime {
  return DateTime.fromISO(date, { zone: timezone }).setLocale(DATE_LOCALE);
}

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

const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = 24 * MINUTES_PER_HOUR;

/**
 * 30 -> "30 min", 75 -> "1 h 15 min", 1440 -> "1 day", 10080 -> "7 days"
 *
 * THE DAYS TIER EXISTS FOR THE CANCELLATION WINDOW, not for service lengths. A
 * service is capped at 480 minutes by serviceInputSchema, so nothing on a
 * booking, a menu or an email can reach a day — that tier is unreachable from
 * every caller except `Tenant.cancellationWindowMinutes`, which Day 12 made
 * owner-settable up to a week. Before that it was a seed-time 120 and always
 * read "2 h"; the moment an owner could type 10080 this started rendering
 * "168 h" at customers.
 *
 * Builds from the largest unit down and drops empty parts, so nothing is ever
 * rounded away: 1441 is "1 day 1 min", not "1 day". A window an owner set is a
 * promise made to a customer, so the two must not disagree by a minute.
 *
 * "day"/"days" is spelled out and pluralised while h/min stay as abbreviations —
 * they're unit symbols, which don't take a plural, and "1 days" is the kind of
 * detail that makes a shop's confirmation email look automated.
 */
export function formatDuration(minutes: number): string {
  const days = Math.floor(minutes / MINUTES_PER_DAY);
  const hours = Math.floor((minutes % MINUTES_PER_DAY) / MINUTES_PER_HOUR);
  const remainder = minutes % MINUTES_PER_HOUR;

  const parts: string[] = [];
  if (days > 0) parts.push(days === 1 ? "1 day" : `${days} days`);
  if (hours > 0) parts.push(`${hours} h`);
  if (remainder > 0) parts.push(`${remainder} min`);

  // Zero is the one value with no non-empty part. It reaches here from a
  // cancellation window of 0, and every caller that can pass one has its own
  // wording for it (formatCancellationDeadline below) — this is the fallback, so
  // a new caller gets something honest rather than an empty string.
  return parts.length > 0 ? parts.join(" ") : "0 min";
}

/**
 * How long before an appointment a customer can still cancel, as the phrase that
 * slots into "You can cancel online ___ your appointment."
 *
 * A WINDOW OF 0 GETS ITS OWN WORDING, and this is the whole reason the function
 * exists. `formatDuration(0)` is "0 min", so composing it into that sentence
 * produced "You can cancel online up to 0 min before your appointment" — which
 * reads as a deadline so tight it's effectively no cancellation at all, when the
 * setting means the exact opposite: cancel whenever you like, right up to the
 * start. That's not awkward phrasing, it's the wrong information, and 0 is a
 * value the settings screen deliberately accepts.
 *
 * Shared by all three surfaces that quote the window — the confirmation email,
 * the confirmation page and the cancel page — so they cannot drift into telling
 * one customer something different from another.
 */
export function formatCancellationDeadline(windowMinutes: number): string {
  return windowMinutes === 0
    ? "any time before"
    : `up to ${formatDuration(windowMinutes)} before`;
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
  return localFromInstant(instant, timezone).toFormat("HH:mm");
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
  return localFromISODate(date, timezone).toFormat("ccc, d LLL");
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
  const from = localFromISODate(fromDate, timezone);
  const to = localFromISODate(toDate, timezone);

  const sameMonth = from.hasSame(to, "month") && from.hasSame(to, "year");

  return sameMonth
    ? `${from.toFormat("d")} – ${to.toFormat("d LLL")}`
    : `${from.toFormat("d LLL")} – ${to.toFormat("d LLL")}`;
}

/**
 * An absence as the staff screen lists it: "10 – 12 Aug", "29 Mar", or
 * "10 Aug, 14:00–16:30".
 *
 * The stored row is two instants with nothing marking which of the two shapes
 * the owner picked, so this recovers it: a range that begins and ends exactly on
 * a local midnight is a whole-day one. That test has to be done in the shop's
 * zone — the same instants are mid-afternoon somewhere else — which is why
 * `timezone` is required here as it is on every other function below.
 *
 * The end instant is exclusive (start of the day after the last one away), so
 * the last covered day is a day earlier. Subtracting a day rather than a fixed
 * 24 hours keeps that right across DST, where a local day is 23 or 25 hours.
 */
export function formatTimeOffRange(
  startAt: Date,
  endAt: Date,
  timezone: string,
): string {
  const start = localFromInstant(startAt, timezone);
  const end = localFromInstant(endAt, timezone);

  const wholeDays =
    start.toMillis() === start.startOf("day").toMillis() &&
    end.toMillis() === end.startOf("day").toMillis();

  if (!wholeDays) {
    return `${start.toFormat("d LLL")}, ${start.toFormat("HH:mm")}–${end.toFormat("HH:mm")}`;
  }

  const lastDay = end.minus({ days: 1 });

  return start.hasSame(lastDay, "day")
    ? start.toFormat("d LLL")
    : formatDateRange(
        start.toISODate() as string,
        lastDay.toISODate() as string,
        timezone,
      );
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
  const local = localFromISODate(date, timezone);

  return {
    weekday: local.toFormat("ccc"),
    dayOfMonth: local.toFormat("d"),
  };
}
