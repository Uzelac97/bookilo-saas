/**
 * The cancellation-window rule.
 *
 * Lives beside the other pure booking-rule math (slots.ts, booking-options.ts)
 * rather than in lib/db or in the page, for the reason CLAUDE.md gives for
 * slots.ts: it's a business rule the owner configures, so it belongs somewhere
 * a unit test can reach it without a database or a request.
 */

/**
 * Whether an appointment is still far enough away to be cancelled online.
 *
 * Instant arithmetic, deliberately without Luxon. The other rules in this folder
 * need it because they convert between wall-clock and instants, where the
 * tenant's zone and DST decide the answer. This one measures the gap between two
 * instants, which is the same number of milliseconds in every zone — reaching
 * for wall-clock math here wouldn't just be unnecessary, it would be wrong. See
 * the DST case in the test file: a booking that looks two hours out on a Berlin
 * clock is one real hour away across the spring-forward, and the customer is
 * inside a 120-minute window even though the clock says they're exactly on it.
 *
 * The boundary is inclusive: with a 120-minute window, exactly 120 minutes
 * before the appointment still cancels. "Cancel up to 2 hours before" is how an
 * owner states this rule and how a customer reads it, so the edge belongs to
 * the customer.
 */
export function canCancel(opts: {
  /** The appointment's start, as a UTC instant. */
  startAt: Date;
  now: Date;
  /** `Tenant.cancellationWindowMinutes`. */
  windowMinutes: number;
}): boolean {
  const remainingMs = opts.startAt.getTime() - opts.now.getTime();

  return remainingMs >= opts.windowMinutes * 60_000;
}
