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

/**
 * How long a cancel token keeps resolving after the booking it points at
 * ends. Bounds how long the token can be *read* (the confirmation and cancel
 * pages, and the "too late to cancel" explanation on the latter) — not how
 * long it can be used to cancel, which canCancel() above already closes off
 * the moment the appointment's start time passes, independent of this window.
 * `Booking.cancelToken` is a bearer secret riding in the URL path, so it
 * shows up in Vercel access logs and browser history; there's no reason for
 * it to keep working forever.
 */
export const CANCEL_TOKEN_GRACE_PERIOD_DAYS = 7;

/**
 * Whether a cancel token for a booking that ended at `endAt` should still
 * resolve to that booking, given the current instant `now`.
 *
 * Instant arithmetic, deliberately without Luxon — same reasoning as
 * canCancel above: this measures the gap between two instants, which is the
 * same number of milliseconds in every zone.
 *
 * Inclusive at the boundary: exactly CANCEL_TOKEN_GRACE_PERIOD_DAYS after
 * endAt still resolves; one millisecond later it doesn't.
 */
export function canResolveCancelToken(endAt: Date, now: Date): boolean {
  const elapsedMs = now.getTime() - endAt.getTime();

  return elapsedMs <= CANCEL_TOKEN_GRACE_PERIOD_DAYS * 24 * 60 * 60_000;
}
