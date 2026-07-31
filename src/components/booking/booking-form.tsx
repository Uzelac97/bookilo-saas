"use client";

import { useActionState, useEffect, useState } from "react";

import {
  submitBooking,
  type BookingSubmitState,
  type LostSlotState,
  type RateLimitReason,
} from "@/app/(public)/b/[slug]/book/actions";
import { Field } from "@/components/ui/field";
import type { BookableSlot } from "@/lib/availability/booking-options";
import type { PublicService } from "@/lib/db/services";
import type { PublicStaff } from "@/lib/db/staff";
import { formatBookingDate, formatSlotTime } from "@/lib/format";
import {
  customerDetailsSchema,
  type CustomerDetails,
} from "@/lib/validation/booking";

type FieldErrors = Partial<Record<keyof CustomerDetails, string>>;

/**
 * Lives here rather than next to the action: a "use server" module turns every
 * export into a server reference, so a constant exported from there reaches the
 * client as an action proxy instead of this object. See the note in actions.ts.
 */
const INITIAL_STATE: BookingSubmitState = { status: "idle" };

/**
 * Step three: confirm what's being booked, collect who's booking it.
 *
 * Validation runs twice against the *same* schema — here for the instant
 * feedback, and again inside the server action, which is the one that counts. A
 * customer therefore cannot see a message the server wouldn't have produced.
 *
 * On success the action redirects and this component never re-renders, so there
 * is no success state to hold. The failures it does render are the ones a
 * customer can act on by typing. The three that aren't — the barber being taken,
 * the whole slot being taken, or a time the shop never offered — are handed
 * upward via `onSlotLost`, because each is fixed by fresh server data, and in two
 * of the three cases this form is about to unmount along with the selection that
 * produced it.
 */
export function BookingForm({
  slug,
  service,
  date,
  slot,
  staff,
  timezone,
  onSlotLost,
}: {
  slug: string;
  service: PublicService;
  date: string;
  slot: BookableSlot;
  staff: PublicStaff[];
  timezone: string;
  onSlotLost: (lost: LostSlotState) => void;
}) {
  const [clientErrors, setClientErrors] = useState<FieldErrors>({});
  const [state, formAction, pending] = useActionState<
    BookingSubmitState,
    FormData
  >(submitBooking, INITIAL_STATE);

  // "Any barber" resolves to the first id in staffIds — the order the two
  // lib/db queries agree on. Shown here so the customer knows who they're
  // getting before they commit, not after the email arrives. The same id is
  // submitted below, so the barber they were promised is the barber the server
  // verifies is free.
  const assigned = staff.find((member) => member.id === slot.staffIds[0]);

  const errors: FieldErrors =
    state.status === "invalid" ? state.fieldErrors : clientErrors;

  // The whole state object goes up, not just its tag: `staff_taken` carries the
  // staffId, and the flow needs it to name the barber who was taken.
  useEffect(() => {
    if (
      state.status === "staff_taken" ||
      state.status === "slot_taken" ||
      state.status === "unavailable"
    ) {
      onSlotLost(state);
    }
  }, [state, onSlotLost]);

  /**
   * Client-side gate in front of the action. Returning early from a form
   * action's onSubmit requires preventDefault, so this validates first and only
   * lets the submission through when the payload would pass on the server too.
   */
  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    const form = new FormData(event.currentTarget);
    const parsed = customerDetailsSchema.safeParse({
      name: form.get("name"),
      phone: form.get("phone"),
      email: form.get("email"),
    });

    if (!parsed.success) {
      event.preventDefault();

      const next: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as keyof CustomerDetails;
        next[field] ??= issue.message;
      }
      setClientErrors(next);
      return;
    }

    setClientErrors({});
  }

  return (
    <form
      action={formAction}
      onSubmit={handleSubmit}
      className="flex flex-col gap-5"
    >
      {/* The parts of the request that aren't the customer's to type. None of
          these is trusted: the slug is re-looked-up server-side, and the
          service/barber/instant are re-checked against freshly computed
          availability before anything is inserted. */}
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="serviceId" value={service.id} />
      <input type="hidden" name="staffId" value={slot.staffIds[0]} />
      <input
        type="hidden"
        name="startAt"
        value={slot.startAt.toISOString()}
      />
      <dl className="flex flex-col gap-1.5 rounded-2xl border border-zinc-200 bg-white p-4 text-sm">
        <SummaryRow label="Service" value={service.name} />
        <SummaryRow
          label="When"
          value={`${formatBookingDate(date, timezone)} at ${formatSlotTime(slot.startAt, timezone)}`}
        />
        {assigned ? <SummaryRow label="Barber" value={assigned.name} /> : null}
      </dl>

      <Field
        id="name"
        label="Your name"
        autoComplete="name"
        error={errors.name}
      />
      <Field
        id="phone"
        label="Phone"
        type="tel"
        autoComplete="tel"
        error={errors.phone}
      />
      <Field
        id="email"
        label="Email"
        type="email"
        autoComplete="email"
        hint="Optional — for your confirmation and cancellation link."
        error={errors.email}
      />

      {state.status === "rate_limited" ? (
        // Rendered here rather than handed to the flow via onSlotLost, unlike
        // the three states above: nothing is wrong with the chosen slot, so
        // refreshing the grid would be beside the point — and it would unmount
        // this form and the message with it, for a customer who hasn't been
        // asked to change anything.
        <p
          role="alert"
          className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          {rateLimitMessage(state.reason, state.shopPhone)}
        </p>
      ) : null}

      {state.status === "error" ? (
        <p role="alert" className="text-sm text-red-700">
          Something went wrong on our end and the booking wasn&rsquo;t saved.
          Please try again.
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="mt-1 rounded-lg bg-zinc-900 px-4 py-2.5 text-base font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
      >
        {pending ? "Confirming…" : "Confirm booking"}
      </button>
    </form>
  );
}

/**
 * What to tell someone the rate limiter turned away.
 *
 * Both messages assume a real customer, because most of the people who see this
 * will be one — a shop's regular booking their next few Saturdays, or a family
 * sharing a phone number. The limiter can't tell them apart from a script, so
 * the wording doesn't try to: it states the situation and offers the phone,
 * rather than implying anything about what they were doing.
 *
 * Falling back to "get in touch with the shop" when there's no number on file:
 * `Tenant.phone` is nullable, and inventing a way to reach a shop that hasn't
 * given one would be worse than saying it plainly.
 */
function rateLimitMessage(
  reason: RateLimitReason,
  shopPhone: string | null,
): string {
  const contact = shopPhone
    ? `call the shop on ${shopPhone}`
    : "get in touch with the shop directly";

  return reason === "too_many_upcoming"
    ? `You already have several appointments booked here. To add another, ${contact}.`
    : `That's a few bookings in a short time. If you need another appointment, ${contact}.`;
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-zinc-500">{label}</dt>
      <dd className="text-right font-medium text-zinc-900">{value}</dd>
    </div>
  );
}

// Field moved to components/ui/field.tsx on Day 11 — the services, staff and
// manual-booking forms needed the identical input, and this was the second copy
// waiting to happen. Unchanged in behaviour; the styling rationale travelled
// with it.
