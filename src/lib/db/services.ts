import type { ServiceInput } from "@/lib/validation/service";

import { prisma } from "./prisma";

/**
 * What a write scoped by tenant reports back.
 *
 * NOT_FOUND covers "no such service" and "that service belongs to another
 * tenant" as one outcome, on the same reasoning as getBookingByCancelToken: the
 * caller must not be able to tell them apart, because the difference is exactly
 * the fact a probing request wants to learn.
 */
export type ServiceWriteResult = { ok: true } | { ok: false; reason: "NOT_FOUND" };

/**
 * A service as the public booking pages need it. Narrower than the Prisma model
 * on purpose — nothing outside lib/db/** should be handed columns it doesn't
 * render.
 */
export type PublicService = {
  id: string;
  name: string;
  durationMinutes: number;
  priceMinorUnits: number;
  category: string | null;
  /** English display values; null means "same as the German". See lib/i18n/service-text.ts. */
  nameEn: string | null;
  categoryEn: string | null;
};

/**
 * The bookable services for one tenant, ordered for display.
 *
 * `active: true` is load-bearing, not cosmetic: there is no hard-delete for
 * Service (CLAUDE.md) — "removing" one always means active = false — so retired
 * rows are expected to exist and must never surface on a public page or in a
 * booking form.
 *
 * Ordering is category-then-name with nulls last, which means the uncategorized
 * services arrive as a contiguous run at the end. The grouping in
 * components/booking/service-list.tsx is then a single order-preserving fold
 * rather than a sort of its own.
 */
export async function getActiveServices(
  tenantId: string,
): Promise<PublicService[]> {
  return prisma.service.findMany({
    where: { tenantId, active: true },
    orderBy: [{ category: { sort: "asc", nulls: "last" } }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      durationMinutes: true,
      priceMinorUnits: true,
      category: true,
      nameEn: true,
      categoryEn: true,
    },
  });
}

/** A service as the owner's management screen needs it: the public shape plus `active`. */
export type ManagedService = PublicService & { active: boolean };

/**
 * Every service a tenant has, retired ones included.
 *
 * The counterpart to getActiveServices above, and the distinction is the same
 * one getStaffForCalendar draws against getActiveStaff: there is no hard-delete
 * for Service (CLAUDE.md), so a retired row is a row the *owner* must still be
 * able to see and reactivate, while a customer must never be offered it.
 *
 * Ordered active-first so the working list isn't pushed below the archive, then
 * by the same category-then-name ordering the public page uses — an owner
 * comparing the two screens sees the same sequence.
 */
export async function getServicesForTenant(
  tenantId: string,
): Promise<ManagedService[]> {
  return prisma.service.findMany({
    where: { tenantId },
    orderBy: [
      { active: "desc" },
      { category: { sort: "asc", nulls: "last" } },
      { name: "asc" },
    ],
    select: {
      id: true,
      name: true,
      durationMinutes: true,
      priceMinorUnits: true,
      category: true,
      nameEn: true,
      categoryEn: true,
      active: true,
    },
  });
}

/**
 * Adds a service. `tenantId` comes from the server-side session (CLAUDE.md
 * rule 2) — a create is the one write with no id to scope, so the session is the
 * only thing deciding whose service this is.
 */
export async function createService(
  tenantId: string,
  input: ServiceInput,
): Promise<{ id: string }> {
  const { name, nameEn, durationMinutes, priceMinorUnits, category, categoryEn } =
    input;

  return prisma.service.create({
    data: {
      tenantId,
      name,
      durationMinutes,
      priceMinorUnits,
      // Explicit null rather than omitted: this is also the update path's shape,
      // where clearing a category has to actually clear it.
      category: category ?? null,
      nameEn: nameEn ?? null,
      categoryEn: categoryEn ?? null,
    },
    select: { id: true },
  });
}

/**
 * Edits a service.
 *
 * `updateMany` rather than `update`, and this is the pattern every tenant-scoped
 * write in lib/db/** follows. `update` takes a unique `where`, which means an id
 * on its own — Prisma would happily rewrite another tenant's service given a
 * guessed id, because the tenant column never enters the query. `updateMany`
 * accepts a compound filter, so `tenantId` sits in the same `where` clause and a
 * foreign id simply matches nothing. That is the whole guardrail, and it is the
 * same class of hole rule 2a exists for on the booking side.
 *
 * TWO THINGS THIS DELIBERATELY DOES NOT DO, both of which look like bugs:
 *
 * - Changing `durationMinutes` does not move existing bookings. `endAt` and
 *   `blockedUntil` are snapshotted at creation by createBooking, so an
 *   appointment already on the calendar keeps the length it was booked at.
 *   That's correct — the customer was told 30 minutes — and "fixing" it would
 *   silently reshuffle a day the owner has already planned.
 * - Changing `priceMinorUnits` DOES rewrite reported history. Nothing snapshots
 *   the price: summariseDay reads it live off this row, so editing it moves
 *   yesterday's revenue figure too. Recorded as a real consequence in
 *   EXECUTION-PLAN.md rather than fixed here — a price snapshot is a schema
 *   change and belongs with payments.
 */
export async function updateService(
  tenantId: string,
  serviceId: string,
  input: ServiceInput,
): Promise<ServiceWriteResult> {
  const { name, nameEn, durationMinutes, priceMinorUnits, category, categoryEn } =
    input;

  const { count } = await prisma.service.updateMany({
    where: { id: serviceId, tenantId },
    data: {
      name,
      durationMinutes,
      priceMinorUnits,
      category: category ?? null,
      nameEn: nameEn ?? null,
      categoryEn: categoryEn ?? null,
    },
  });

  return count === 0 ? { ok: false, reason: "NOT_FOUND" } : { ok: true };
}

/**
 * Retires a service, or brings one back.
 *
 * THIS IS WHAT "DELETE" MEANS HERE, and there is deliberately no delete function
 * in this file to reach for instead. `Booking.serviceId` is `onDelete: Restrict`
 * (schema.prisma), so a real delete would either fail against any service that
 * has ever been booked or, worse, take the booking history with it. Setting
 * `active = false` removes it from getActiveServices — the public list and the
 * booking flow's own re-check — while every past appointment keeps rendering
 * with the service it was actually booked for.
 */
export async function setServiceActive(
  tenantId: string,
  serviceId: string,
  active: boolean,
): Promise<ServiceWriteResult> {
  const { count } = await prisma.service.updateMany({
    where: { id: serviceId, tenantId },
    data: { active },
  });

  return count === 0 ? { ok: false, reason: "NOT_FOUND" } : { ok: true };
}
