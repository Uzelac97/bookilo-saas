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
import { useLocale, useT } from "@/lib/i18n/client";
import { translateMessage, type Translator } from "@/lib/i18n/translate";
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
  const t = useT();
  const locale = useLocale();
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
  // Errors arrive as message keys from the shared schema (lib/validation).
  const errorText = (message: string | undefined) =>
    message ? translateMessage(t, message) : undefined;

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
      <dl className="flex flex-col gap-1.5 rounded-2xl border border-line bg-surface p-5 text-sm shadow-sm">
        <SummaryRow label={t("booking.service")} value={service.name} />
        <SummaryRow
          label={t("booking.when")}
          value={t("booking.dateAtTime", {
            date: formatBookingDate(date, timezone, locale),
            time: formatSlotTime(slot.startAt, timezone),
          })}
        />
        {assigned ? (
          <SummaryRow label={t("booking.barber")} value={assigned.name} />
        ) : null}
      </dl>

      <Field
        id="name"
        label={t("book.yourName")}
        autoComplete="name"
        error={errorText(errors.name)}
      />
      <Field
        id="phone"
        label={t("book.phone")}
        type="tel"
        autoComplete="tel"
        error={errorText(errors.phone)}
      />
      <Field
        id="email"
        label={t("common.email")}
        type="email"
        autoComplete="email"
        hint={t("book.emailHint")}
        error={errorText(errors.email)}
      />

      {state.status === "rate_limited" ? (
        // Rendered here rather than handed to the flow via onSlotLost, unlike
        // the three states above: nothing is wrong with the chosen slot, so
        // refreshing the grid would be beside the point — and it would unmount
        // this form and the message with it, for a customer who hasn't been
        // asked to change anything.
        <p
          role="alert"
          className="rounded-xl border border-warning-line bg-warning-soft px-4 py-3 text-sm text-warning"
        >
          {rateLimitMessage(t, state.reason, state.shopPhone)}
        </p>
      ) : null}

      {state.status === "error" ? (
        <p role="alert" className="text-sm text-danger">
          {t("book.error")}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        // Taller than the 44px minimum the rest of the flow holds to: this is
        // the one button the whole page exists to get pressed.
        className="mt-1 inline-flex min-h-12 items-center justify-center rounded-lg bg-primary px-4 text-base font-medium text-on-primary transition-colors hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:bg-fill-strong"
      >
        {pending ? t("book.submitting") : t("book.submit")}
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
  t: Translator,
  reason: RateLimitReason,
  shopPhone: string | null,
): string {
  // One whole sentence per case — see the note on the cancel page for why the
  // "call the shop" part cannot be translated as a fragment.
  if (reason === "too_many_upcoming") {
    return shopPhone
      ? t("book.rateLimitUpcomingPhone", { phone: shopPhone })
      : t("book.rateLimitUpcoming");
  }

  return shopPhone
    ? t("book.rateLimitRecentPhone", { phone: shopPhone })
    : t("book.rateLimitRecent");
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-fg-muted">{label}</dt>
      <dd className="text-right font-medium text-fg">{value}</dd>
    </div>
  );
}

// Field moved to components/ui/field.tsx on Day 11 — the services, staff and
// manual-booking forms needed the identical input, and this was the second copy
// waiting to happen. Unchanged in behaviour; the styling rationale travelled
// with it.
