"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition } from "react";

import {
  createManualBooking,
  type ManualBookingState,
} from "@/app/(dashboard)/dashboard/bookings/new/actions";
import { Field } from "@/components/ui/field";
import type { SlotRules, StaffAvailability } from "@/lib/availability/slots";
import {
  describeConflicts,
  localInstant,
  suggestSlots,
  type ManualBookingConflict,
} from "@/lib/dashboard/manual-booking";
import type { PublicService } from "@/lib/db/services";
import type { PublicStaff } from "@/lib/db/staff";
import { formatDuration, formatPrice, formatSlotTime } from "@/lib/format";

/** See the note in service-form.tsx — a "use server" module can't export this. */
const INITIAL_STATE: ManualBookingState = { status: "idle" };

/**
 * Booking on the owner's behalf: a walk-in, or one taken over the phone.
 *
 * THE TIME FIELD IS FREE-FORM AND THE SUGGESTIONS ARE SUGGESTIONS. A customer is
 * offered a closed list because the shop decides what it sells; an owner
 * standing in their own shop is telling the software what happened. So the open
 * slots are one-tap buttons, and anything else the owner types is accepted with
 * whatever warnings apply — see the module comment in
 * lib/dashboard/manual-booking.ts.
 *
 * Barber, service and time are held here rather than in the URL, unlike the
 * calendar's `date`/`view`. The line is whether the server has to fetch
 * something: the day's availability does depend on the date, so changing that is
 * a navigation, but switching barber or service only re-slices data this
 * component already has. Putting those in the URL would mean a round trip per
 * dropdown change for no new data.
 */
export function ManualBookingForm({
  staff,
  services,
  availability,
  rules,
  date,
  now,
  prefill,
}: {
  staff: PublicStaff[];
  services: PublicService[];
  /** One entry per active barber, for `date`. */
  availability: StaffAvailability[];
  rules: SlotRules;
  date: string;
  /** The server's clock at render. Advisory — it only drives warnings. */
  now: Date;
  prefill: { staffId?: string; serviceId?: string; time?: string };
}) {
  const router = useRouter();
  const [navigating, startNavigation] = useTransition();

  const [staffId, setStaffId] = useState(
    () => prefill.staffId ?? staff[0]?.id ?? "",
  );
  const [serviceId, setServiceId] = useState(
    () => prefill.serviceId ?? services[0]?.id ?? "",
  );
  const [time, setTime] = useState(() => prefill.time ?? "");

  const [state, formAction, pending] = useActionState<
    ManualBookingState,
    FormData
  >(createManualBooking, INITIAL_STATE);

  const service = services.find((item) => item.id === serviceId);
  const member = availability.find((entry) => entry.staffId === staffId);

  // Both computed from data already on the client, so they update as the owner
  // changes barber, service or time — no round trip, and the same pure functions
  // the tests cover.
  const context =
    service && member
      ? {
          date,
          serviceDurationMinutes: service.durationMinutes,
          rules,
          availability: member,
          now,
        }
      : null;

  const slots = context ? suggestSlots(context) : [];
  const startAt = time ? localInstant(date, time, rules.timezone) : null;
  const conflicts: ManualBookingConflict[] =
    context && startAt ? describeConflicts(context, startAt) : [];

  const errors = state.status === "invalid" ? state.fieldErrors : {};

  /** A date change needs the server's availability for the new day. */
  function changeDate(next: string) {
    if (!next) return;

    startNavigation(() => {
      router.replace(`/dashboard/bookings/new?date=${next}`, { scroll: false });
    });
  }

  return (
    <form action={formAction} className="flex flex-col gap-6">
      {/* The three selections travel as hidden fields because the visible
          controls are either navigation (date) or plain state (barber, service,
          time). Every one of them is re-checked server-side: createBooking
          re-verifies the barber and service belong to this tenant and are
          active, and the exclusion constraint decides the time. */}
      <input type="hidden" name="staffId" value={staffId} />
      <input type="hidden" name="serviceId" value={serviceId} />
      <input type="hidden" name="date" value={date} />
      <input type="hidden" name="time" value={time} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Select
          id="barber"
          label="Barber"
          value={staffId}
          onChange={setStaffId}
          options={staff.map((member) => ({
            value: member.id,
            label: member.name,
          }))}
        />

        <Select
          id="service"
          label="Service"
          value={serviceId}
          onChange={setServiceId}
          options={services.map((item) => ({
            value: item.id,
            label: `${item.name} · ${formatDuration(item.durationMinutes)} · ${formatPrice(item.priceMinorUnits)}`,
          }))}
        />

        <div className="flex flex-col gap-1.5">
          <label htmlFor="date-input" className="text-sm font-medium text-zinc-700">
            Day
          </label>
          <input
            id="date-input"
            type="date"
            value={date}
            onChange={(event) => changeDate(event.target.value)}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base text-zinc-900 outline-none focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="time-input" className="text-sm font-medium text-zinc-700">
            Start time
          </label>
          <input
            id="time-input"
            type="time"
            value={time}
            onChange={(event) => setTime(event.target.value)}
            aria-invalid={errors.time ? true : undefined}
            className={[
              "rounded-lg border bg-white px-3 py-2 text-base text-zinc-900 outline-none focus:ring-1",
              errors.time
                ? "border-red-400 focus:border-red-500 focus:ring-red-500"
                : "border-zinc-300 focus:border-zinc-900 focus:ring-zinc-900",
            ].join(" ")}
          />
          {errors.time ? (
            <p role="alert" className="text-sm text-red-700">
              {errors.time}
            </p>
          ) : null}
        </div>
      </div>

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-medium text-zinc-700">
          {navigating ? "Loading times…" : "Open times"}
        </h3>

        {slots.length === 0 ? (
          <p className="text-sm text-zinc-500">
            {member && member.workingHours.length === 0
              ? "This barber has no hours set for any day."
              : "Nothing open on this day — you can still type a time below."}
          </p>
        ) : (
          <div
            // Same overflow treatment as the public date strip: a native
            // scrollbar under a row of chips reads as a rendering fault.
            className="-mx-1 flex flex-wrap gap-2 px-1"
          >
            {slots.map((slot) => {
              const label = formatSlotTime(slot, rules.timezone);
              const chosen = label === time;

              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => setTime(label)}
                  aria-pressed={chosen}
                  className={[
                    "rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
                    chosen
                      ? "border-zinc-900 bg-zinc-900 text-white"
                      : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100",
                  ].join(" ")}
                >
                  {label}
                </button>
              );
            })}
          </div>
        )}
      </section>

      {conflicts.length > 0 ? (
        <ul
          // Warnings, not errors: role="status" rather than "alert", because
          // nothing here has gone wrong and nothing is being refused.
          role="status"
          className="flex flex-col gap-1 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          {conflicts.map((conflict) => (
            <li key={conflict}>{CONFLICT_MESSAGES[conflict]}</li>
          ))}
        </ul>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          id="name"
          label="Customer name"
          autoComplete="off"
          error={errors.name}
        />
        <Field
          id="phone"
          label="Phone"
          type="tel"
          autoComplete="off"
          hint="Also how the shop recognises a returning customer."
          error={errors.phone}
        />
        <Field
          id="email"
          label="Email"
          type="email"
          autoComplete="off"
          hint="Optional — sends them a confirmation and a cancel link."
          error={errors.email}
        />
      </div>

      {state.status === "taken" ? (
        <p
          role="alert"
          className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          That barber already has an appointment overlapping this time. Pick
          another time or another barber.
        </p>
      ) : null}

      {state.status === "impossible_time" ? (
        <p
          role="alert"
          className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          That time doesn&rsquo;t exist on this day — the clocks go forward. Pick
          a time before or after the change.
        </p>
      ) : null}

      {state.status === "error" ? (
        <p
          role="alert"
          className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          Something went wrong and the booking wasn&rsquo;t saved. Please try
          again.
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending || !staffId || !serviceId || !time}
        className="w-fit rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Saving…" : "Create booking"}
      </button>
    </form>
  );
}

/**
 * What each warning says, in the owner's terms.
 *
 * Every one of these describes a booking that will still be created. The wording
 * therefore states the fact and stops — "outside their hours" rather than "can't
 * be booked" — because a message that sounds like a refusal in front of a button
 * that works is worse than no message.
 */
const CONFLICT_MESSAGES: Record<ManualBookingConflict, string> = {
  OVERLAPS_BOOKING:
    "This barber already has something booked over this time — the shop's own rules will reject it.",
  DURING_TIME_OFF: "This falls inside time off for this barber.",
  OUTSIDE_HOURS: "This is outside this barber's working hours for that day.",
  IN_THE_PAST: "This time has already passed.",
};

function Select({
  id,
  label,
  value,
  onChange,
  options,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-zinc-700">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        // Same explicit bg/text as the shared Field, and for the same reason —
        // Tailwind's preflight resets form controls to inherited colours.
        className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base text-zinc-900 outline-none focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
