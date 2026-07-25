import { randomUUID } from "node:crypto";

import type { Booking, BookingSource } from "@prisma/client";

import { prisma } from "./prisma";

// Re-exported so app code can name these types without importing @prisma/client,
// which the no-restricted-imports rule bans outside lib/db/**.
export type { Booking, BookingSource };

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
