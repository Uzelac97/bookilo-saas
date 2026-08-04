import type { BookingRulesInput } from "@/lib/validation/settings";

import { prisma } from "./prisma";

/**
 * Loads a tenant by its id. The caller must have obtained the id from the
 * server-side session (see lib/auth/session.ts) — never from client input.
 */
export async function getTenantById(tenantId: string) {
  return prisma.tenant.findUnique({
    where: { id: tenantId },
  });
}

/**
 * Public booking pages resolve their tenant from the URL slug on every request.
 * Used from Day 5 onward; kept here so both resolution paths live side by side.
 */
export async function getTenantBySlug(slug: string) {
  return prisma.tenant.findUnique({
    where: { slug },
  });
}

/** What a tenant-scoped write reports back, same shape as ServiceWriteResult. */
export type TenantWriteResult = { ok: true } | { ok: false; reason: "NOT_FOUND" };

/**
 * The three booking rules as the settings screen reads them back out.
 *
 * Declared here, in a plain module, rather than beside the form that renders it —
 * `"use client"` rewrites every export of a file into a client reference, and
 * CLAUDE.md puts types under that rule alongside constants. Same placement as
 * ManagedService, which the services form imports for exactly this reason.
 */
export type BookingRules = {
  bufferMinutes: number;
  minLeadMinutes: number;
  cancellationWindowMinutes: number;
};

/**
 * Saves the three booking rules the settings screen edits.
 *
 * THE TENANT BOUNDARY LOOKS ABSENT HERE AND ISN'T. Every other write in
 * lib/db/** puts `tenantId` next to a row id in the same `where` clause, because
 * the id alone would let a guessed value reach another shop's row. For `Tenant`
 * the id *is* the boundary — there is no second column to scope by, and no
 * value of `tenantId` addresses anyone but its own tenant. What keeps that safe
 * is upstream: the id comes from `requireSession()` (CLAUDE.md rule 2) and never
 * from form data.
 *
 * What this file can guarantee is the other half — that this is a *narrow* write.
 * It takes `BookingRulesInput` and destructures it, so it cannot be pointed at
 * `slug`, `timezone`, `contactEmail` or anything else on the row, whatever a
 * caller passes. Widening it is a deliberate edit here, not an accident at a call
 * site.
 *
 * `updateMany` rather than `update` for the same reason as updateService: a row
 * that vanished mid-session comes back as NOT_FOUND rather than a thrown P2025.
 *
 * WORTH KNOWING ABOUT THE VALUES, because two of the three behave differently
 * once saved:
 *
 * - `bufferMinutes` is forward-only. createBooking snapshots
 *   `blockedUntil = endAt + bufferMinutes` at creation and never recomputes it,
 *   so existing appointments keep the gaps they were booked with.
 * - `cancellationWindowMinutes` applies retroactively. Nothing snapshots it —
 *   getBookingByCancelToken reads it live off this row — so raising it can lock
 *   out a customer whose confirmation email quoted the old number.
 */
export async function updateBookingRules(
  tenantId: string,
  input: BookingRulesInput,
): Promise<TenantWriteResult> {
  const { bufferMinutes, minLeadMinutes, cancellationWindowMinutes } = input;

  const { count } = await prisma.tenant.updateMany({
    where: { id: tenantId },
    data: { bufferMinutes, minLeadMinutes, cancellationWindowMinutes },
  });

  return count === 0 ? { ok: false, reason: "NOT_FOUND" } : { ok: true };
}
