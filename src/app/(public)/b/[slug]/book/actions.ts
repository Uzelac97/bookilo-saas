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
import {
  createBooking,
  getBookingByCancelToken,
  getBookingRateForPhone,
  type BookingRate,
} from "@/lib/db/bookings";
import { findOrCreateCustomer } from "@/lib/db/customers";
import { sendBookingEmails } from "@/lib/email/booking-emails";
import { getActiveServices } from "@/lib/db/services";
import { getTenantBySlug } from "@/lib/db/tenant";
import {
  bookingSubmissionSchema,
  type CustomerDetails,
} from "@/lib/validation/booking";
import { fieldErrorsFrom } from "@/lib/validation/field-errors";

/** The submission fields a customer typed, and so the only ones with an input to show an error on. */
const CUSTOMER_FIELDS: ReadonlySet<PropertyKey | undefined> = new Set<
  keyof CustomerDetails
>(["name", "phone", "email"]);

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
 * Folding `staff_taken` into `unavailable` in particular would tell the second
 * customer in the everyday collision to give up on a time that is still free
 * with another barber.
 */
export type BookingSubmitState =
  | { status: "idle" }
  | { status: "invalid"; fieldErrors: Partial<Record<keyof CustomerDetails, string>> }
  | { status: "staff_taken"; staffId: string }
  | { status: "slot_taken" }
  | { status: "unavailable" }
  | { status: "rate_limited"; reason: RateLimitReason; shopPhone: string | null }
  | { status: "error" };

/**
 * Which limit was hit — two different situations that need two different things
 * said, on the same reasoning as the three rejection states above.
 *
 * `too_many_upcoming` is the one a *legitimate* customer can reach: someone who
 * genuinely has five appointments booked ahead. Telling them they've been
 * booking too fast would be false and would read as an accusation.
 */
export type RateLimitReason = "too_many_recent" | "too_many_upcoming";

/**
 * The limits, as plain module constants.
 *
 * Not `Tenant` columns: nobody has asked to tune these per shop, and a settings
 * field added "in case" is exactly what CLAUDE.md says to flag instead of build.
 * Moving them into the database later is additive and cheap.
 *
 * Sized to be invisible to real use and awkward for a script. A barber's regular
 * booking their next four Saturdays in one sitting stays under both; so does a
 * family booking three cuts back to back from one phone. Someone submitting the
 * form in a loop hits the first within a minute.
 */
const RATE_WINDOW_MINUTES = 60;
const MAX_BOOKINGS_PER_WINDOW = 3;
const MAX_UPCOMING_BOOKINGS = 5;

/** Which limit this phone has hit, or null if it's within both. */
function rateLimitReason(rate: BookingRate): RateLimitReason | null {
  if (rate.recent >= MAX_BOOKINGS_PER_WINDOW) return "too_many_recent";
  if (rate.upcoming >= MAX_UPCOMING_BOOKINGS) return "too_many_upcoming";

  return null;
}

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
 * because step 5 re-computes availability from the database and finds the
 * requested instant in the result. Without that, a hand-crafted request books
 * 03:00 on a closed Sunday and Postgres accepts it happily.
 *
 * This is the unauthenticated path by design (no customer accounts), so step 3
 * is the only thing between the form and an unbounded number of submissions.
 * Per-IP limiting stays deferred (CLAUDE.md): it needs a persistent store that
 * Vercel's serverless runtime can't provide in memory, which is a dependency and
 * therefore a decision, not a detail.
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
    // Only the three customer fields have inputs to attach a message to. A
    // failure on slug/serviceId/staffId/startAt isn't something a customer can
    // fix by typing — that's a stale or tampered payload, so it reads as
    // "unavailable" and sends them back to a fresh list of times.
    const payloadInvalid = parsed.error.issues.some(
      (issue) => !CUSTOMER_FIELDS.has(issue.path[0]),
    );
    if (payloadInvalid) return { status: "unavailable" };

    return { status: "invalid", fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const { slug, serviceId, staffId, startAt, ...customer } = parsed.data;

  // 2. Resolve the tenant from the slug, server-side. The public path
  //    (EXECUTION-PLAN.md §3) — never mixed with the session path, and the slug
  //    names which shop rather than authorizing anything.
  const tenant = await getTenantBySlug(slug);
  if (!tenant) return { status: "unavailable" };

  const now = new Date();

  // 3. Rate-limit by phone, before anything expensive runs. Shedding load is the
  //    point, so this sits ahead of the availability computation in step 5 and
  //    ahead of step 6, which is what would otherwise leave a Customer row
  //    behind for every attempt.
  //
  //    The phone arrives normalised from the schema — the whole reason that
  //    normalisation exists is that this compares stored strings, and "030 123"
  //    vs "030123" would hand out a fresh allowance per spelling.
  const rate = await getBookingRateForPhone(tenant.id, customer.phone, {
    now,
    windowMinutes: RATE_WINDOW_MINUTES,
  });

  const limited = rateLimitReason(rate);
  if (limited) {
    return {
      status: "rate_limited",
      reason: limited,
      // Carried in the payload rather than threaded down as a prop: the action
      // already holds the tenant, and the form has no route params of its own.
      shopPhone: tenant.phone,
    };
  }

  // 4. Derive the tenant-local day that contains the requested instant, and
  //    reject anything outside the bookable window. resolveBookingDate clamps
  //    rather than throws, which makes it usable as a predicate: if clamping
  //    moved the date, it was in the past or beyond the horizon.
  const local = DateTime.fromJSDate(startAt).setZone(tenant.timezone);
  const date = local.isValid ? local.toISODate() : null;

  if (!date || resolveBookingDate(date, now, tenant.timezone) !== date) {
    return { status: "unavailable" };
  }

  const service = await findActiveService(tenant.id, serviceId);
  if (!service) return { status: "unavailable" };

  // 5. Re-compute availability and require the requested instant to be in it.
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
    // 6. Resolve the customer. After the availability check, so a request that
    //    was never going to succeed doesn't leave a Customer row behind. A
    //    returning customer's stored name and email are left alone: this form
    //    is unauthenticated, so knowing a phone number must not be enough to
    //    rewrite what the shop has on file.
    const { id: customerId } = await findOrCreateCustomer(tenant.id, customer, {
      updateExisting: false,
    });

    // 7. Insert. createBooking re-verifies staff/service/customer against the
    //    tenant (CLAUDE.md rule 2a) and owns the endAt/blockedUntil arithmetic
    //    and the cancel token. Step 5 already implies the staff and service
    //    belong to this tenant; that check stays as the structural guarantee,
    //    not a redundancy to remove.
    const result = await createBooking({
      tenantId: tenant.id,
      staffId,
      serviceId,
      customerId,
      startAt,
    });

    // 8. The race the exclusion constraint exists to catch: the slot was open
    //    when we computed it a moment ago and taken by the time we inserted.
    //
    //    Classified against *freshly re-read* availability rather than reported
    //    as a flat "taken". Losing this race means losing the barber, not
    //    necessarily the time: two simultaneous "Any barber" submissions both
    //    resolve to the same first-listed barber, so the loser very often still
    //    has a free colleague at that instant and only needs to confirm again.
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
    // after step 5 that means a service or barber was deactivated mid-request,
    // or a bug. Either way it's ours to see and not the customer's to read.
    console.error("submitBooking failed", error);
    return { status: "error" };
  }

  // 9. Emails, after the booking is committed and never before it.
  //
  //    Awaited inside its own try/catch, per CLAUDE.md: un-awaited work is
  //    killed the moment Vercel sends the response, so a fire-and-forget send
  //    silently never happens — and a send that fails must never turn a saved
  //    booking into an error the customer sees. sendBookingEmails already
  //    swallows and logs per-message failures; this catch covers the re-read.
  //
  //    Re-read rather than assembled from the variables above: the email should
  //    describe what was actually committed, and this is the same shape the
  //    confirmation page renders, so the two can't disagree. `contactEmail` and
  //    the phone come from scope because neither is part of that shape — the
  //    owner's address isn't the booking's, and the phone is what was just
  //    validated.
  try {
    const committed = await getBookingByCancelToken(token, new Date());
    if (committed) {
      await sendBookingEmails(committed, tenant.contactEmail, customer.phone);
    }
  } catch (error) {
    console.error("booking emails failed", error);
  }

  // 10. Outside the try block: redirect() signals by throwing, and the catch
  //    above would swallow it and leave the customer staring at a filled-in
  //    form with no confirmation — the same trap as loginAction. The slug is
  //    the tenant row's own, not the submitted one, so the redirect target is
  //    never built from client input.
  redirect(`/b/${tenant.slug}/booked/${token}`);
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
