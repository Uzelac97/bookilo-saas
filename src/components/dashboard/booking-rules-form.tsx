"use client";

import { useActionState } from "react";

import {
  updateBookingRulesAction,
  type BookingRulesFormState,
} from "@/app/(dashboard)/dashboard/settings/actions";
import { Field } from "@/components/ui/field";
import type { BookingRules } from "@/lib/db/tenant";

/**
 * Lives here rather than next to the action: a "use server" module turns every
 * export into a server reference, so a constant exported from there reaches the
 * client as an action proxy instead of this object (CLAUDE.md).
 */
const INITIAL_STATE: BookingRulesFormState = { status: "idle" };

/**
 * The shop's booking rules.
 *
 * Deliberately does NOT reset on success, unlike the create branch of
 * ServiceForm. That form clears because the owner is adding the next service;
 * here the values just saved are the values to keep showing, and blanking them
 * would read as having lost the setting.
 *
 * Uncontrolled inputs with `defaultValue`, so the fields keep what was typed
 * across a failed submit — an owner correcting one bad number must not have the
 * other two reset underneath them.
 */
export function BookingRulesForm({ rules }: { rules: BookingRules }) {
  const [state, formAction, pending] = useActionState<
    BookingRulesFormState,
    FormData
  >(updateBookingRulesAction, INITIAL_STATE);

  const errors = state.status === "invalid" ? state.fieldErrors : {};

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {/* No hidden fields at all — not even a row id. The session names the only
          tenant this can write (CLAUDE.md rule 2), so there is deliberately
          nothing here for a tampered value to ride in on. */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          id="bufferMinutes"
          label="Gap between appointments"
          inputMode="numeric"
          defaultValue={String(rules.bufferMinutes)}
          placeholder="0"
          hint="Minutes of clean-up time after each cut. 0 for back-to-back."
          error={errors.bufferMinutes}
        />
        <Field
          id="minLeadMinutes"
          label="Minimum notice"
          inputMode="numeric"
          defaultValue={String(rules.minLeadMinutes)}
          placeholder="60"
          hint="How far ahead an online booking must be made. Doesn't apply to walk-ins you enter yourself."
          error={errors.minLeadMinutes}
        />
        <Field
          id="cancellationWindowMinutes"
          label="Cancellation window"
          inputMode="numeric"
          defaultValue={String(rules.cancellationWindowMinutes)}
          placeholder="120"
          hint="How long before an appointment a customer can still cancel online."
          error={errors.cancellationWindowMinutes}
        />
      </div>

      {state.status === "saved" ? (
        <p
          role="status"
          className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
        >
          Saved.
        </p>
      ) : null}

      {state.status === "gone" ? (
        <p
          role="alert"
          className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900"
        >
          Your shop record couldn’t be found. Sign out and back in.
        </p>
      ) : null}

      {state.status === "error" ? (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          Something went wrong and nothing was saved. Please try again.
        </p>
      ) : null}

      <div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save rules"}
        </button>
      </div>

      {/* Stated on the form, not in a doc, because these are the three things an
          owner gets wrong the moment they change a value and look at the result.
          The first two are the same shape as the note on the services form: what
          a booking snapshotted at creation, versus what is read live. */}
      <div className="flex flex-col gap-2 text-sm text-zinc-500">
        <p>
          Changing the gap affects new bookings only — appointments already in
          the calendar keep the gaps they were booked with.
        </p>
        <p>
          Changing the cancellation window applies to{" "}
          <strong className="font-medium text-zinc-700">existing</strong>{" "}
          bookings too. Customers were emailed the old window when they booked,
          so making it longer can stop someone cancelling who was told they
          could.
        </p>
      </div>
    </form>
  );
}
