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
import { useLocale, useT } from "@/lib/i18n/client";
import { serviceName } from "@/lib/i18n/service-text";
import { translateMessage, type MessageKey } from "@/lib/i18n/translate";

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
  const t = useT();
  const locale = useLocale();
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
  // Errors arrive as message keys from the shared schema (lib/validation).
  const errorText = (message: string | undefined) =>
    message ? translateMessage(t, message) : undefined;

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
          label={t("booking.barber")}
          value={staffId}
          onChange={setStaffId}
          options={staff.map((member) => ({
            value: member.id,
            label: member.name,
          }))}
        />

        <Select
          id="service"
          label={t("booking.service")}
          value={serviceId}
          onChange={setServiceId}
          options={services.map((item) => ({
            value: item.id,
            label: `${serviceName(item, locale)} · ${formatDuration(item.durationMinutes, locale)} · ${formatPrice(item.priceMinorUnits)}`,
          }))}
        />

        <div className="flex flex-col gap-1.5">
          <label htmlFor="date-input" className="text-sm font-medium text-fg-secondary">
            {t("manual.day")}
          </label>
          <input
            id="date-input"
            type="date"
            value={date}
            onChange={(event) => changeDate(event.target.value)}
            className="rounded-lg border border-line-strong bg-surface px-3 py-2 text-base text-fg outline-none focus:border-focus focus:ring-1 focus:ring-focus"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="time-input" className="text-sm font-medium text-fg-secondary">
            {t("manual.startTime")}
          </label>
          <input
            id="time-input"
            type="time"
            value={time}
            onChange={(event) => setTime(event.target.value)}
            aria-invalid={errors.time ? true : undefined}
            className={[
              "rounded-lg border bg-surface px-3 py-2 text-base text-fg outline-none focus:ring-1",
              errors.time
                ? "border-danger-line-strong focus:border-danger-focus focus:ring-danger-focus"
                : "border-line-strong focus:border-focus focus:ring-focus",
            ].join(" ")}
          />
          {errors.time ? (
            <p role="alert" className="text-sm text-danger">
              {errorText(errors.time)}
            </p>
          ) : null}
        </div>
      </div>

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-medium text-fg-secondary">
          {navigating ? t("manual.loadingTimes") : t("manual.openTimes")}
        </h3>

        {slots.length === 0 ? (
          <p className="text-sm text-fg-muted">
            {member && member.workingHours.length === 0
              ? t("manual.noHoursAtAll")
              : t("manual.nothingOpen")}
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
                      ? "border-primary bg-primary text-on-primary"
                      : "border-line-strong bg-surface text-fg-secondary hover:bg-subtle",
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
          className="flex flex-col gap-1 rounded-xl border border-warning-line bg-warning-soft px-4 py-3 text-sm text-warning"
        >
          {conflicts.map((conflict) => (
            <li key={conflict}>{t(CONFLICT_MESSAGES[conflict])}</li>
          ))}
        </ul>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          id="name"
          label={t("manual.customerName")}
          autoComplete="off"
          error={errorText(errors.name)}
        />
        <Field
          id="phone"
          label={t("book.phone")}
          type="tel"
          autoComplete="off"
          hint={t("manual.phoneHint")}
          error={errorText(errors.phone)}
        />
        <Field
          id="email"
          label={t("common.email")}
          type="email"
          autoComplete="off"
          hint={t("manual.emailHint")}
          error={errorText(errors.email)}
        />
      </div>

      {state.status === "taken" ? (
        <p
          role="alert"
          className="rounded-xl border border-danger-line bg-danger-soft px-4 py-3 text-sm text-danger"
        >
          {t("manual.taken")}
        </p>
      ) : null}

      {state.status === "impossible_time" ? (
        <p
          role="alert"
          className="rounded-xl border border-danger-line bg-danger-soft px-4 py-3 text-sm text-danger"
        >
          {t("manual.impossibleTime")}
        </p>
      ) : null}

      {state.status === "error" ? (
        <p
          role="alert"
          className="rounded-xl border border-danger-line bg-danger-soft px-4 py-3 text-sm text-danger"
        >
          {t("manual.error")}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending || !staffId || !serviceId || !time}
        className="w-fit rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-on-primary transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? t("common.saving") : t("manual.submit")}
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
const CONFLICT_MESSAGES: Record<ManualBookingConflict, MessageKey> = {
  OVERLAPS_BOOKING: "manual.conflictOverlaps",
  DURING_TIME_OFF: "manual.conflictTimeOff",
  OUTSIDE_HOURS: "manual.conflictOutsideHours",
  IN_THE_PAST: "manual.conflictPast",
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
      <label htmlFor={id} className="text-sm font-medium text-fg-secondary">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        // Same explicit bg/text as the shared Field, and for the same reason —
        // Tailwind's preflight resets form controls to inherited colours.
        className="rounded-lg border border-line-strong bg-surface px-3 py-2 text-base text-fg outline-none focus:border-focus focus:ring-1 focus:ring-focus"
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
