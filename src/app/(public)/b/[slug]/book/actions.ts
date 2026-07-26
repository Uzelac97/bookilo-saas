"use server";

import { DateTime } from "luxon";
import { redirect } from "next/navigation";

import {
  findSlot,
  mergeStaffSlots,
  resolveBookingDate,
  type BookableSlot,
} from "@/lib/availability/booking-options";
import { computeSlots, type SlotRules } from "@/lib/availability/slots";
import {
  getStaffAvailability,
  type StaffAvailability,
} from "@/lib/db/availability";
import { createBooking } from "@/lib/db/bookings";
import { findOrCreateCustomer } from "@/lib/db/customers";
import { getActiveServices } from "@/lib/db/services";
import { getTenantBySlug } from "@/lib/db/tenant";
import {
  bookingSubmissionSchema,
  type CustomerDetails,
} from "@/lib/validation/booking";

/**
 * What the form renders after a submit. Success is absent on purpose — it
 * redirects to the confirmation page instead of returning.
 *
 * The three rejection states are three genuinely different facts, and collapsing
 * any two of them tells a customer something untrue:
 *
 * - `staff_taken` — the time is still bookable, just not with the barber they
 *   were shown. This is the *common* multi-barber collision: two customers on
 *   "Any barber" pick 14:30, the first takes Marco, and the second was promised
 *   Marco. Recoverable in one tap, so it must not read like a dead end.
 * - `slot_taken` — the time is a real slot and every barber is now busy in it.
 *   Someone genuinely got there first; another time will work.
 * - `unavailable` — the request described a time the shop never offered: a stale
 *   bookmark, an expired lead time, or a tampered payload. Start over.
 *
 * An earlier version returned `unavailable` for all three. Measured against the
 * demo shop, that meant the everyday two-customer collision told the second one
 * "that time isn't available anymore" about a time that *was* still available
 * with the other barber — advice to give up on a booking they could still make.
 */
export type BookingSubmitState =
  | { status: "idle" }
  | { status: "invalid"; fieldErrors: Partial<Record<keyof CustomerDetails, string>> }
  | { status: "staff_taken"; staffId: string }
  | { status: "slot_taken" }
  | { status: "unavailable" }
  | { status: "error" };

/**
 * The rejections the *flow* renders rather than the form, because the fix for
 * each is a fresh slot list. Derived from the state above so there is one source
 * of truth for the set. Type-only export, so the "use server" caveat below
 * doesn't apply — types are erased, values are not.
 */
export type LostSlotState = Extract<
  BookingSubmitState,
  { status: "staff_taken" | "slot_taken" | "unavailable" }
>;

// The initial state deliberately lives in the client component, not here. A
// "use server" module may only export async functions: Next.js turns every
// export into a server reference, so an exported `{ status: "idle" }` constant
// arrives on the client as a callable action proxy rather than the object, and
// useActionState's first render then reads `state.status` off the wrong thing.
// Verified against .next/.../server-reference-manifest.json, which listed an
// action id for the constant. Types are safe to export — they're erased.

/**
 * Commits a public booking.
 *
 * The order of the checks below is the point of this file. The exclusion
 * constraint in the database prevents *overlap* and nothing else — it knows
 * nothing about working hours, time off, the minimum lead time, or the booking
 * horizon. So a payload is not trusted because it inserts cleanly; it's trusted
 * because step 4 re-computes availability from the database and finds the
 * requested instant in the result. Without that, a hand-crafted request books
 * 03:00 on a closed Sunday and Postgres accepts it happily.
 *
 * This is the unauthenticated path by design (no customer accounts). Per-phone
 * rate limiting is Day 8, per CLAUDE.md.
 */
export async function submitBooking(
  _prevState: BookingSubmitState,
  formData: FormData,
): Promise<BookingSubmitState> {
  // 1. Validate. Against the same schema the form uses, so "valid" has one
  //    definition rather than a client-side opinion and a server-side one.
  const parsed = bookingSubmissionSchema.safeParse({
    slug: formData.get("slug"),
    serviceId: formData.get("serviceId"),
    staffId: formData.get("staffId"),
    startAt: formData.get("startAt"),
    name: formData.get("name"),
    phone: formData.get("phone"),
    email: formData.get("email"),
  });

  if (!parsed.success) {
    const fieldErrors: Partial<Record<keyof CustomerDetails, string>> = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      // Only the three customer fields have inputs to attach a message to. A
      // failure on slug/serviceId/staffId/startAt isn't something a customer can
      // fix by typing — that's a stale or tampered payload, so it reads as
      // "unavailable" and sends them back to a fresh list of times.
      if (field === "name" || field === "phone" || field === "email") {
        fieldErrors[field] ??= issue.message;
        continue;
      }

      return { status: "unavailable" };
    }

    return { status: "invalid", fieldErrors };
  }

  const { slug, serviceId, staffId, startAt, ...customer } = parsed.data;

  // 2. Resolve the tenant from the slug, server-side. The public path
  //    (EXECUTION-PLAN.md §3) — never mixed with the session path, and the slug
  //    names which shop rather than authorizing anything.
  const tenant = await getTenantBySlug(slug);
  if (!tenant) return { status: "unavailable" };

  // 3. Derive the tenant-local day that contains the requested instant, and
  //    reject anything outside the bookable window. resolveBookingDate clamps
  //    rather than throws, which makes it usable as a predicate: if clamping
  //    moved the date, it was in the past or beyond the horizon.
  const now = new Date();
  const local = DateTime.fromJSDate(startAt).setZone(tenant.timezone);
  const date = local.isValid ? local.toISODate() : null;

  if (!date || resolveBookingDate(date, now, tenant.timezone) !== date) {
    return { status: "unavailable" };
  }

  const service = await findActiveService(tenant.id, serviceId);
  if (!service) return { status: "unavailable" };

  // 4. Re-compute availability and require the requested instant to be in it.
  //
  //    Deliberately NOT scoped to the requested barber, even though that would be
  //    a narrower query. The whole shop's availability is what makes it possible
  //    to tell "Marco is busy but Ivan is free at 14:30" apart from "14:30 is
  //    gone" — and those two need opposite advice. findSlot still answers the
  //    primary question exactly as before, since a merged slot's `staffIds` holds
  //    every barber free at that instant.
  const availability = await getStaffAvailability(tenant.id, {
    date,
    timezone: tenant.timezone,
  });

  const context: SlotContext = {
    date,
    serviceDurationMinutes: service.durationMinutes,
    rules: {
      timezone: tenant.timezone,
      bufferMinutes: tenant.bufferMinutes,
      minLeadMinutes: tenant.minLeadMinutes,
    },
    now,
  };

  if (!findSlot(gridFor(availability, context), startAt, staffId)) {
    return classifyMiss(availability, context, startAt, staffId);
  }

  let token: string;

  try {
    // 5. Resolve the customer. After the availability check, so a request that
    //    was never going to succeed doesn't leave a Customer row behind.
    const { id: customerId } = await findOrCreateCustomer(tenant.id, customer);

    // 6. Insert. createBooking re-verifies staff/service/customer against the
    //    tenant (CLAUDE.md rule 2a) and owns the endAt/blockedUntil arithmetic
    //    and the cancel token. Step 4 already implies the staff and service
    //    belong to this tenant; that check stays as the structural guarantee,
    //    not a redundancy to remove.
    const result = await createBooking({
      tenantId: tenant.id,
      staffId,
      serviceId,
      customerId,
      startAt,
    });

    // 7. The race the exclusion constraint exists to catch: the slot was open
    //    when we computed it a moment ago and taken by the time we inserted.
    //
    //    Classified against *freshly re-read* availability rather than reported
    //    as a flat "taken". Losing this race means losing the barber, not
    //    necessarily the time: two simultaneous "Any barber" submissions both
    //    resolve to the same first-listed barber, so the loser very often still
    //    has a free colleague at that instant and only needs to confirm again.
    //    Measured — before this, the loser was told to pick a different time
    //    while another barber sat free in the same slot.
    if (!result.ok) {
      return classifyMiss(
        await getStaffAvailability(tenant.id, {
          date,
          timezone: tenant.timezone,
        }),
        context,
        startAt,
        staffId,
      );
    }

    token = result.booking.cancelToken;
  } catch (error) {
    // createBooking throws on a foreign key that doesn't belong to the tenant —
    // after step 4 that means a service or barber was deactivated mid-request,
    // or a bug. Either way it's ours to see and not the customer's to read.
    console.error("submitBooking failed", error);
    return { status: "error" };
  }

  // 8. Outside the try block: redirect() signals by throwing, and the catch
  //    above would swallow it and leave the customer staring at a filled-in
  //    form with no confirmation — the same trap as loginAction.
  redirect(`/b/${slug}/booked/${token}`);
}

/** Everything the slot computation needs that doesn't change within one request. */
type SlotContext = {
  date: string;
  serviceDurationMinutes: number;
  rules: SlotRules;
  now: Date;
};

/** The merged "any barber" grid, exactly as the booking page builds it. */
function gridFor(
  staff: StaffAvailability[],
  context: SlotContext,
): BookableSlot[] {
  return mergeStaffSlots(
    computeSlots({
      date: context.date,
      serviceDurationMinutes: context.serviceDurationMinutes,
      rules: context.rules,
      staff,
      now: context.now,
    }),
  );
}

/**
 * Why a booking for `startAt` with `staffId` can't happen — three different facts
 * that need three different things said to the customer.
 *
 * Shared by both rejection paths on purpose. The pre-insert availability check
 * and the exclusion constraint catch the same collision at different moments —
 * one microsecond apart, in the concurrent case — so having them explain it
 * differently would be arbitrary from the customer's side.
 *
 * The caller passes availability read *after* the collision, so `staff_taken`
 * reflects who is free now rather than who was free when the page rendered.
 */
function classifyMiss(
  availability: StaffAvailability[],
  context: SlotContext,
  startAt: Date,
  staffId: string,
): LostSlotState {
  const instant = startAt.getTime();
  const offersInstant = (slots: BookableSlot[]) =>
    slots.some((slot) => slot.startAt.getTime() === instant);

  // (a) Still bookable, just not with this barber. One tap from done: the
  //     refreshed form re-resolves to whoever is free.
  if (offersInstant(gridFor(availability, context))) {
    return { status: "staff_taken", staffId };
  }

  // (b) A real slot the shop offers, with every barber now busy in it.
  //     Recomputed with the bookings stripped out: if that alone makes the
  //     instant bookable, other bookings are the only thing in the way, which is
  //     exactly "someone got there first". Time off deliberately stays in — a
  //     barber who isn't working never offered the time, which is case (c).
  const withoutBookings = availability.map((member) => ({
    ...member,
    bookings: [],
  }));
  if (offersInstant(gridFor(withoutBookings, context))) {
    return { status: "slot_taken" };
  }

  // (c) Never offered: outside working hours, inside time off or the lead time,
  //     off the 15-minute grid, or simply invented.
  return { status: "unavailable" };
}

/**
 * The service the request names, or null if this tenant has no active service
 * with that id.
 *
 * Reuses the existing public list rather than adding a single-row helper: it's a
 * handful of rows, already the tenant-scoped shape, and it guarantees the same
 * `active: true` filter the booking page rendered from — so a service retired
 * since a stale tab was opened is not bookable through it.
 */
async function findActiveService(tenantId: string, serviceId: string) {
  const services = await getActiveServices(tenantId);

  return services.find((service) => service.id === serviceId) ?? null;
}
