"use client";

import { useState } from "react";

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
 * Step three: confirm what's being booked, collect who's booking it.
 *
 * Day 6 stops at the validated payload — `onSubmit` is a stub. Day 7 replaces
 * it with the server action, which validates against the *same* schema, so the
 * messages a customer sees here and the ones the server enforces cannot drift.
 */
export function BookingForm({
  service,
  date,
  slot,
  staff,
  timezone,
}: {
  service: PublicService;
  date: string;
  slot: BookableSlot;
  staff: PublicStaff[];
  timezone: string;
}) {
  const [errors, setErrors] = useState<FieldErrors>({});

  // "Any barber" resolves to the first id in staffIds — the order the two
  // lib/db queries agree on. Shown here so the customer knows who they're
  // getting before they commit, not after the email arrives.
  const assigned = staff.find((member) => member.id === slot.staffIds[0]);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const form = new FormData(event.currentTarget);
    const parsed = customerDetailsSchema.safeParse({
      name: form.get("name"),
      phone: form.get("phone"),
      email: form.get("email"),
    });

    if (!parsed.success) {
      const next: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as keyof CustomerDetails;
        next[field] ??= issue.message;
      }
      setErrors(next);
      return;
    }

    setErrors({});

    // TODO(Day 7): replace with the submitBooking server action — it resolves
    // tenantId from the slug server-side, re-verifies the staff/service against
    // it (CLAUDE.md rule 2a), and handles the SLOT_TAKEN result.
    console.log("booking payload (stub)", {
      serviceId: service.id,
      staffId: slot.staffIds[0],
      startAt: slot.startAt.toISOString(),
      customer: parsed.data,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
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

      <button
        type="submit"
        className="mt-1 rounded-lg bg-zinc-900 px-4 py-2.5 text-base font-medium text-white transition-colors hover:bg-zinc-800"
      >
        Confirm booking
      </button>
    </form>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-zinc-500">{label}</dt>
      <dd className="text-right font-medium text-zinc-900">{value}</dd>
    </div>
  );
}

function Field({
  id,
  label,
  type = "text",
  autoComplete,
  hint,
  error,
}: {
  id: string;
  label: string;
  type?: string;
  autoComplete?: string;
  hint?: string;
  error?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-zinc-700">
        {label}
      </label>
      <input
        id={id}
        name={id}
        type={type}
        autoComplete={autoComplete}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        // No `required`: validation is the Zod schema's job, so the browser's
        // own messages don't compete with it and say something different.
        className={[
          // text-base, not text-sm — iOS Safari zooms the viewport on focus for
          // anything under 16px, and this form is demoed on a phone.
          "rounded-lg border px-3 py-2 text-base outline-none focus:ring-1",
          error
            ? "border-red-400 focus:border-red-500 focus:ring-red-500"
            : "border-zinc-300 focus:border-zinc-900 focus:ring-zinc-900",
        ].join(" ")}
      />
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-sm text-red-700">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-sm text-zinc-500">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
