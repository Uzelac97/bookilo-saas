import { randomUUID } from "node:crypto";

import type { Booking, BookingSource, BookingStatus } from "@prisma/client";

import { canCancel, canResolveCancelToken } from "@/lib/availability/cancellation";
import { localDayWindowUtc } from "@/lib/availability/slots";

import { prisma } from "./prisma";

// Re-exported so app code can name these types without importing @prisma/client,
// which the no-restricted-imports rule bans outside lib/db/**.
export type { Booking, BookingSource, BookingStatus };

// Kept in sync with prisma/migrations/20260725124130_add_booking_overlap_constraint.
const OVERLAP_CONSTRAINT = "no_overlapping_bookings";
// Postgres SQLSTATE for an exclusion-constraint violation.
const EXCLUSION_VIOLATION_SQLSTATE = "23P01";

export type CreateBookingInput = {
  /** From the server-side session (dashboard) or the slug lookup (public page) — never from client input. */
  tenantId: string;
  staffId: string;
  serviceId: string;
  customerId: string;
  /** A UTC instant. Callers convert from tenant-local wall clock at the boundary. */
  startAt: Date;
  source?: BookingSource;
};

export type CreateBookingResult =
  | { ok: true; booking: Booking }
  | { ok: false; reason: "SLOT_TAKEN" };

/**
 * Creates a booking, deriving endAt/blockedUntil and the cancel token.
 *
 * Deliberately narrow: this enforces the tenant boundary and owns the time-field
 * arithmetic. It does NOT know about availability — working hours, time off,
 * minLeadMinutes and the cancellation window are the caller's business
 * (lib/availability/slots.ts and the submission action).
 *
 * A slot conflict is an expected outcome, so it comes back as
 * `{ ok: false, reason: "SLOT_TAKEN" }` rather than an exception. A foreign key
 * that doesn't belong to the tenant is NOT expected — that's a bug or a tampered
 * request — so it throws.
 */
export async function createBooking(
  input: CreateBookingInput,
): Promise<CreateBookingResult> {
  const { tenantId, staffId, serviceId, customerId, startAt } = input;

  // CLAUDE.md rule 2a: a Prisma foreign key only proves the row exists somewhere,
  // not that it belongs to this tenant. Re-fetch all three scoped by tenantId
  // before inserting, or one tenant's booking can end up pointing at another
  // tenant's staff. Staff and service must also be active — neither the public
  // flow nor the dashboard should book a deactivated barber or a retired service.
  //
  // No transaction around this read-then-write: a row's tenantId cannot change
  // under us, so there is no race for a transaction to protect against.
  const [tenant, staff, service, customer] = await Promise.all([
    prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { bufferMinutes: true },
    }),
    prisma.staff.findFirst({
      where: { id: staffId, tenantId, active: true },
      select: { id: true },
    }),
    prisma.service.findFirst({
      where: { id: serviceId, tenantId, active: true },
      select: { durationMinutes: true },
    }),
    prisma.customer.findFirst({
      where: { id: customerId, tenantId },
      select: { id: true },
    }),
  ]);

  const unresolved = [
    tenant ? null : "tenant",
    staff ? null : "staff (missing, inactive, or another tenant's)",
    service ? null : "service (missing, inactive, or another tenant's)",
    customer ? null : "customer (missing or another tenant's)",
  ].filter((label): label is string => label !== null);

  if (!tenant || !staff || !service || !customer) {
    // Ids are deliberately not echoed back — this message can reach a log.
    throw new Error(
      `createBooking: refusing to insert, unresolved for tenant ${tenantId}: ${unresolved.join(", ")}`,
    );
  }

  // Instant arithmetic, not wall-clock arithmetic: adding minutes to a UTC
  // instant is timezone-independent, so this needs no Luxon. Luxon is for the
  // boundary conversions in slots.ts and the display layer.
  const endAt = new Date(startAt.getTime() + service.durationMinutes * 60_000);
  // Snapshotted now and never recomputed — see the field comment in
  // schema.prisma. endAt stays the honest value for emails and the calendar;
  // blockedUntil exists only for the exclusion constraint.
  const blockedUntil = new Date(
    endAt.getTime() + tenant.bufferMinutes * 60_000,
  );

  try {
    const booking = await prisma.booking.create({
      data: {
        tenantId,
        staffId,
        serviceId,
        customerId,
        startAt,
        endAt,
        blockedUntil,
        // A bearer secret, not an identifier: anyone holding it can cancel the
        // booking. Must come from a CSPRNG — never cuid()/nanoid() (CLAUDE.md).
        cancelToken: randomUUID(),
        ...(input.source ? { source: input.source } : {}),
      },
    });

    return { ok: true, booking };
  } catch (error) {
    if (isSlotTakenError(error)) {
      return { ok: false, reason: "SLOT_TAKEN" };
    }
    throw error;
  }
}

/** How much this phone number has been booking, as the rate limiter reads it. */
export type BookingRate = {
  /** Bookings created inside the window, whatever became of them since. */
  recent: number;
  /** Confirmed appointments still in the future — slots currently held. */
  upcoming: number;
};

/**
 * The two counts the public form's per-phone rate limiting decides on.
 *
 * `phone` must be normalised (lib/validation/phone.ts). This compares stored
 * strings, so an un-normalised value silently counts a different customer's
 * rows — usually nobody's, which fails open.
 *
 * The two numbers answer deliberately different questions, and the status
 * filters are not a copy-paste slip:
 *
 * - `recent` counts every status, cancellations included. Book, cancel, book,
 *   cancel is precisely the loop worth stopping, and a counter that a
 *   cancellation reset would be bypassable by anyone who noticed.
 * - `upcoming` counts CONFIRMED only, because it's about slots being held.
 *   A cancelled future booking holds nothing, so counting it would punish the
 *   customer who did the right thing and freed the slot.
 *
 * Scoped by `tenantId` on both the booking and the customer. The nested filter
 * is technically implied by the outer one — createBooking guarantees a booking's
 * customer shares its tenant — but this query decides whether someone gets
 * turned away, so it states its own boundary rather than inheriting one.
 *
 * Not indexed for: there's no index on `Booking.createdAt` or `(tenantId,
 * customerId)`, so this is a scan of a small table. Correct at MVP volume and
 * not worth a schema change until a real shop's numbers say otherwise.
 */
export async function getBookingRateForPhone(
  tenantId: string,
  phone: string,
  opts: { now: Date; windowMinutes: number },
): Promise<BookingRate> {
  const { now, windowMinutes } = opts;
  const since = new Date(now.getTime() - windowMinutes * 60_000);
  const customer = { tenantId, phone };

  const [recent, upcoming] = await Promise.all([
    prisma.booking.count({
      where: { tenantId, createdAt: { gte: since }, customer },
    }),
    prisma.booking.count({
      where: {
        tenantId,
        status: "CONFIRMED",
        startAt: { gte: now },
        customer,
      },
    }),
  ]);

  return { recent, upcoming };
}

/**
 * How many confirmed appointments a barber has inside an instant range.
 *
 * Exists for one sentence on the staff screen: marking time off does not touch
 * bookings already made, so the owner has to be told how many customers they now
 * need to call. Without the number, the only sign is someone turning up.
 *
 * Overlap is tested against `endAt`, not `blockedUntil`. This counts people, and
 * the buffer after an appointment is not a person — an appointment whose buffer
 * alone reaches into a holiday is not a customer anyone has to phone.
 *
 * CONFIRMED only, for the same reason as getStaffForManagement's count: a
 * cancelled booking holds nothing, and a COMPLETED one is already over.
 */
export async function countConfirmedBookingsInRange(
  tenantId: string,
  staffId: string,
  from: Date,
  to: Date,
): Promise<number> {
  return prisma.booking.count({
    where: {
      tenantId,
      staffId,
      status: "CONFIRMED",
      // Half-open overlap, matching every other range comparison here: an
      // appointment ending exactly when the absence starts doesn't overlap it.
      startAt: { lt: to },
      endAt: { gt: from },
    },
  });
}

/**
 * A booking as everything outside the dashboard sees it: the two token-addressed
 * pages, and the two booking emails.
 *
 * One shape for all four on purpose. They describe the same appointment to the
 * same people, and letting the emails assemble their own view from the action's
 * in-flight variables is how a confirmation ends up describing something
 * marginally different from the page it links to.
 */
export type BookingByToken = {
  id: string;
  startAt: Date;
  endAt: Date;
  status: BookingStatus;
  cancelToken: string;
  service: { name: string; durationMinutes: number; priceMinorUnits: number };
  staff: { name: string };
  customer: { name: string; email: string | null };
  tenant: {
    slug: string;
    name: string;
    timezone: string;
    phone: string | null;
    address: string | null;
    cancellationWindowMinutes: number;
  };
};

/**
 * Loads a booking by its cancel token.
 *
 * DELIBERATELY NOT TENANT-SCOPED, and the only function in lib/db/** that isn't.
 * `cancelToken` is a bearer secret, not an identifier (CLAUDE.md) — holding it
 * *is* the authorization, which is the whole design of a cancel link that works
 * with no customer account. There is no session and no slug to scope by on this
 * path, so a `tenantId` parameter here could only come from the URL, which would
 * be security theatre: an attacker supplying a token they don't have can't guess
 * one, and an attacker holding a real token can also read the slug off it.
 *
 * The tenant is *returned* rather than taken, so the caller can check the token
 * against the slug in its own URL — see the confirmation page, which 404s on a
 * mismatch so one shop's URL can never render another's booking.
 *
 * Callers must treat "not found" and "wrong token" as the same outcome. Never
 * echo the token back into an error message or a log line.
 *
 * Stops resolving once canResolveCancelToken (lib/availability/cancellation.ts)
 * says the grace period past the booking's end has elapsed. `now` is a
 * parameter rather than read inside the function so this stays deterministic
 * in tests. The expiry check happens after the fetch rather than as a WHERE
 * clause so the boundary logic itself lives in one pure, DB-free function.
 */
export async function getBookingByCancelToken(
  cancelToken: string,
  now: Date,
): Promise<BookingByToken | null> {
  const booking = await prisma.booking.findUnique({
    where: { cancelToken },
    select: {
      id: true,
      startAt: true,
      endAt: true,
      status: true,
      cancelToken: true,
      service: {
        select: { name: true, durationMinutes: true, priceMinorUnits: true },
      },
      staff: { select: { name: true } },
      customer: { select: { name: true, email: true } },
      tenant: {
        select: {
          slug: true,
          name: true,
          timezone: true,
          // For the cancel page's "too late to do this online" branch, which has
          // to offer a way to reach the shop instead, and for the confirmation
          // email's footer. Nullable in the schema, so callers must handle its
          // absence rather than assume a number.
          phone: true,
          // For the confirmation email. A customer who has never been to the
          // shop needs the address more than anything else in that message.
          address: true,
          cancellationWindowMinutes: true,
        },
      },
    },
  });

  if (!booking || !canResolveCancelToken(booking.endAt, now)) return null;

  return booking;
}

export type CancelBookingResult =
  | { ok: true }
  | { ok: false; reason: "NOT_FOUND" | "TOO_LATE" | "NOT_CANCELLABLE" };

/**
 * Cancels a booking on the strength of its cancel token.
 *
 * Not tenant-scoped by id, for the same reason as getBookingByCancelToken above —
 * the token is the authorization, and there is no session on this path. It does
 * take the `slug` from the URL the cancel form was on, and a token belonging to
 * a different shop resolves to NOT_FOUND. That is the write-side twin of the
 * cancel page's own `booking.tenant.slug !== slug` 404: the action is reachable
 * by direct POST with any arguments, so it can't rely on the page having checked.
 *
 * Callers must treat NOT_FOUND as covering "no such booking", "wrong token" and
 * "wrong shop", and must never put the token in a log line or an error message.
 *
 * Cancelling frees the slot with no further work: `CANCELLED` sits outside both
 * the `no_overlapping_bookings` constraint's WHERE clause and OCCUPYING_STATUSES
 * in ./availability.ts, so the time reappears in the grid and a new booking can
 * take it. Probe phase E covers exactly this.
 *
 * The write is a conditional updateMany rather than an update, so a double-click
 * or a reloaded form is idempotent instead of a race: the second one matches no
 * rows because the first already moved the status off CONFIRMED.
 */
export async function cancelBookingByToken(
  cancelToken: string,
  slug: string,
  now: Date,
): Promise<CancelBookingResult> {
  const booking = await prisma.booking.findUnique({
    where: { cancelToken, tenant: { slug } },
    select: {
      status: true,
      startAt: true,
      tenant: { select: { cancellationWindowMinutes: true } },
    },
  });

  if (!booking) return { ok: false, reason: "NOT_FOUND" };
  // Already cancelled is a success, not an error. The customer asked for this
  // booking to be off the books and it is — telling them something went wrong
  // because they pressed the button twice would be false.
  if (booking.status === "CANCELLED") return { ok: true };
  // COMPLETED or NO_SHOW: the appointment already happened. Not something a
  // cancel link should be able to rewrite.
  if (booking.status !== "CONFIRMED") {
    return { ok: false, reason: "NOT_CANCELLABLE" };
  }

  if (
    !canCancel({
      startAt: booking.startAt,
      now,
      windowMinutes: booking.tenant.cancellationWindowMinutes,
    })
  ) {
    return { ok: false, reason: "TOO_LATE" };
  }

  const { count } = await prisma.booking.updateMany({
    where: { cancelToken, tenant: { slug }, status: "CONFIRMED" },
    data: { status: "CANCELLED" },
  });

  if (count === 0) {
    // The status changed between the read above and this write — the owner
    // marking it complete from the dashboard, or a second tab that got there
    // first. Re-read rather than guess, so a double submit still reports the
    // success it actually achieved.
    const current = await prisma.booking.findUnique({
      where: { cancelToken },
      select: { status: true },
    });

    return current?.status === "CANCELLED"
      ? { ok: true }
      : { ok: false, reason: "NOT_CANCELLABLE" };
  }

  return { ok: true };
}

/**
 * A booking as the owner's dashboard renders it.
 *
 * Narrower than the Prisma model on purpose, same reasoning as PublicService in
 * ./services.ts. `cancelToken` is deliberately absent: it's a bearer secret, the
 * dashboard has no use for it, and selecting it would put it in the serialized
 * RSC payload of every overview render for no reason.
 */
export type DashboardBooking = {
  id: string;
  startAt: Date;
  endAt: Date;
  status: BookingStatus;
  source: BookingSource;
  service: { name: string; priceMinorUnits: number };
  // `id` is here for the calendar, which groups bookings into one column per
  // barber and cannot do that by name — two barbers called Marco would collapse
  // into one column, and a renamed barber would split into two.
  staff: { id: string; name: string };
  // phone so the owner can call the customer; email because a no-show is worth
  // following up in writing.
  customer: { name: string; phone: string; email: string | null };
};

/**
 * Every booking on a tenant's books across a span of tenant-local calendar days,
 * `fromDate` and `toDate` both inclusive.
 *
 * Reuses localDayWindowUtc at both ends for the same reason getStaffAvailability
 * in ./availability.ts does: the day boundary is defined once, so this stays
 * correct on the 23- and 25-hour days either side of a DST change. Taking
 * `to` from the *last* day's window rather than adding 7×24h to the first is
 * what makes a week containing a transition still cover exactly seven days.
 *
 * `tenantId` comes from the server-side session on dashboard routes — never from
 * client input (CLAUDE.md rule 2).
 *
 * Two things here look like getStaffAvailability and deliberately aren't:
 *
 * - The filter is `startAt` inside [from, to), NOT the blockedUntil overlap that
 *   availability.ts uses. That query answers "is this slot occupied", where a
 *   booking bleeding across a boundary genuinely matters at both ends. This one
 *   answers "what is on the books", and an appointment belongs to the day it
 *   starts on — an overlap filter here would list one booking under two days.
 * - There is no status filter at all. OCCUPYING_STATUSES in ./availability.ts is
 *   pinned to the exclusion constraint's WHERE clause and says nothing about
 *   what a human should see: an owner needs the cancellation and the no-show in
 *   front of them precisely because those aren't holding a slot. The caller
 *   decides how to render each status.
 */
export async function getBookingsForRange(
  tenantId: string,
  opts: { fromDate: string; toDate: string; timezone: string },
): Promise<DashboardBooking[]> {
  const { fromDate, toDate, timezone } = opts;

  if (toDate < fromDate) {
    throw new Error(
      `getBookingsForRange: toDate "${toDate}" precedes fromDate "${fromDate}"`,
    );
  }

  const { from } = localDayWindowUtc(fromDate, timezone);
  const { to } = localDayWindowUtc(toDate, timezone);

  return prisma.booking.findMany({
    where: { tenantId, startAt: { gte: from, lt: to } },
    // createdAt is a stable tie-break for two barbers booked at the same time —
    // without it Postgres is free to return them in a different order per query,
    // and the list would reshuffle on every refresh.
    orderBy: [{ startAt: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      startAt: true,
      endAt: true,
      status: true,
      source: true,
      service: { select: { name: true, priceMinorUnits: true } },
      staff: { select: { id: true, name: true } },
      customer: { select: { name: true, phone: true, email: true } },
    },
  });
}

/**
 * Every booking on a tenant's books for one tenant-local calendar day.
 *
 * A single-day range rather than its own query, so the overview and the calendar
 * can never disagree about what "on the books today" means.
 */
export async function getBookingsForDay(
  tenantId: string,
  opts: { date: string; timezone: string },
): Promise<DashboardBooking[]> {
  return getBookingsForRange(tenantId, {
    fromDate: opts.date,
    toDate: opts.date,
    timezone: opts.timezone,
  });
}

/**
 * True when the failure is the overlap exclusion constraint rejecting the insert.
 *
 * Prisma has no typed mapping for SQLSTATE 23P01, so this arrives as a
 * PrismaClientUnknownRequestError with the raw driver text in `.message`. We match
 * on the message rather than the error class on purpose: the class is an
 * implementation detail of Prisma's error mapping and has moved between versions,
 * whereas the SQLSTATE and the constraint name are ours and are stable.
 *
 * scripts/probe-exclusion-constraint.ts is what verifies this actually matches —
 * if phase A there reports a raw error instead of SLOT_TAKEN, fix this first.
 */
function isSlotTakenError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  return (
    error.message.includes(EXCLUSION_VIOLATION_SQLSTATE) ||
    error.message.includes(OVERLAP_CONSTRAINT)
  );
}
