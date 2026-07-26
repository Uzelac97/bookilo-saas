/**
 * Phone normalisation for the customer identity key.
 *
 * Phone is what identifies a customer within a tenant
 * (`@@unique([tenantId, phone])` in schema.prisma), and from Day 8 it's also
 * what the per-phone rate limiter counts against. Both of those compare stored
 * strings, so "030 123 456" and "030/123456" being two different customers is
 * not a cosmetic problem: it forks one person's history in the dashboard, and
 * it hands a rate limiter an trivial bypass — retype the same number with
 * different spacing and the count starts from zero.
 *
 * So the form still accepts whatever shape someone types (see the deliberately
 * loose regex in ./booking.ts), and this collapses it to one canonical form on
 * the way in.
 */

/**
 * The canonical form of a typed phone number: digits only, with a leading `+`
 * kept when the number was written in international form.
 *
 *   "030 / 123-456"    -> "030123456"
 *   "+49 176 1234567"  -> "+491761234567"
 *   "0049 176 1234567" -> "+491761234567"
 *
 * KNOWN LIMIT, accepted deliberately: "0176 1234567" and "+49 176 1234567" are
 * the same phone to a human and two different customers here. Collapsing them
 * needs to know the tenant's country in order to swap the national trunk `0`
 * for a dialing code — that's a `Tenant` column, which is a schema change and
 * its own decision. Until then a customer who books once each way appears
 * twice, which is a duplicate row and a slightly softer rate limit, not a
 * correctness or tenancy problem.
 *
 * `00` -> `+` is safe to do without that column: `00` is the international
 * access prefix throughout the German-speaking market these tenants sell into,
 * and it can't be confused with a national number, which never starts `00`.
 * (It is *not* universal — North America dials `011` — so this line is scoped
 * to the same assumption as the de-DE price formatting in lib/format.ts, and
 * moves whenever that one does.)
 */
export function normalizePhone(raw: string): string {
  // "+49 (0)176 …" is how a German number gets written on a business card and
  // in a phone's contact list, and the parenthesised 0 is precisely the digit
  // you drop when dialing the international form — so it is noise, not data.
  // Stripped before the digits are collapsed, because afterwards it's an
  // indistinguishable 0 in the middle of a number. Anchored to a leading `+`
  // and dialing code so it can only ever match the trunk prefix.
  const trimmed = raw.trim().replace(/^(\+\d{1,3})\s*\(0\)\s*/, "$1");
  const digits = trimmed.replace(/\D/g, "");

  if (trimmed.startsWith("+")) return `+${digits}`;
  if (digits.startsWith("00")) return `+${digits.slice(2)}`;

  return digits;
}

/**
 * How many actual digits a normalised number carries.
 *
 * The length check has to run on this rather than on the raw string, or
 * "12 () - . -" is a six-character phone number with two digits in it.
 */
export function phoneDigitCount(normalized: string): number {
  return normalized.startsWith("+")
    ? normalized.length - 1
    : normalized.length;
}
