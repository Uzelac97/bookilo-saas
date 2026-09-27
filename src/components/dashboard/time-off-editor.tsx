"use client";

import { useActionState, useRef, useState } from "react";

import {
  addTimeOffAction,
  deleteTimeOffAction,
  type TimeOffState,
} from "@/app/(dashboard)/dashboard/staff/actions";
import type { TimeOffRow } from "@/lib/db/staff";
import { formatTimeOffRange } from "@/lib/format";
import { useLocale, useT } from "@/lib/i18n/client";
import { translateMessage } from "@/lib/i18n/translate";

/** See the note in service-form.tsx — a "use server" module can't export this. */
const INITIAL_STATE: TimeOffState = { status: "idle" };

/**
 * When a barber is away.
 *
 * A client component for one reason: the all-day toggle decides whether the time
 * fields are on screen at all. Everything else is an ordinary uncontrolled form
 * posting to a server action.
 *
 * The two shapes are deliberate and different. All-day takes a date range, which
 * is what a holiday is. Timed takes one date and two times, which is what "out
 * Tuesday afternoon" is. There is no multi-day timed range — see toTimeOffRange
 * for why that middle case is refused rather than half-supported.
 */
export function TimeOffEditor({
  staffId,
  staffName,
  timeOff,
  timezone,
}: {
  staffId: string;
  staffName: string;
  timeOff: TimeOffRow[];
  timezone: string;
}) {
  const t = useT();
  const locale = useLocale();
  const [allDay, setAllDay] = useState(true);
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState<TimeOffState, FormData>(
    addTimeOffAction,
    INITIAL_STATE,
  );

  return (
    <div className="flex flex-col gap-5">
      {timeOff.length === 0 ? (
        <p className="text-sm text-fg-muted">
          {t("timeOff.empty", { name: staffName })}
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-line-faint">
          {timeOff.map((row) => (
            <li
              key={row.id}
              className="flex flex-wrap items-center justify-between gap-3 py-2.5"
            >
              <div className="flex flex-col">
                <span className="text-sm font-medium text-fg">
                  {formatTimeOffRange(row.startAt, row.endAt, timezone, locale)}
                </span>
                {row.reason ? (
                  <span className="text-sm text-fg-muted">{row.reason}</span>
                ) : null}
              </div>

              {/* A real delete, unlike staff and services — nothing references a
                  TimeOff row, so removing one just reopens the time. */}
              <form action={deleteTimeOffAction}>
                <input type="hidden" name="timeOffId" value={row.id} />
                <input type="hidden" name="staffId" value={staffId} />
                <button
                  type="submit"
                  className="rounded-lg border border-line-strong bg-surface px-2.5 py-1.5 text-sm text-fg-tertiary transition-colors hover:bg-subtle hover:text-fg"
                >
                  {t("staff.remove")}
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}

      <form
        ref={formRef}
        action={formAction}
        className="flex flex-col gap-4 border-t border-line-faint pt-5"
      >
        <input type="hidden" name="staffId" value={staffId} />
        {/* The toggle is client state, so its value has to be posted explicitly —
            an unchecked checkbox posts nothing at all. */}
        <input type="hidden" name="allDay" value={String(allDay)} />

        <label className="flex w-fit items-center gap-2 text-sm text-fg-secondary">
          <input
            type="checkbox"
            checked={allDay}
            onChange={(event) => setAllDay(event.target.checked)}
            className="size-4 rounded border-line-strong"
          />
          {t("timeOff.allDay")}
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <DateOrTimeField
            id="startDate"
            type="date"
            label={allDay ? t("timeOff.firstDay") : t("manual.day")}
          />

          {allDay ? (
            <DateOrTimeField
              id="endDate"
              type="date"
              label={t("timeOff.lastDay")}
              hint={t("timeOff.lastDayHint")}
            />
          ) : (
            <div className="flex items-end gap-2">
              <DateOrTimeField
                id="startTime"
                type="time"
                label={t("timeOff.from")}
              />
              <DateOrTimeField id="endTime" type="time" label={t("timeOff.to")} />
            </div>
          )}
        </div>

        <DateOrTimeField
          id="reason"
          type="text"
          label={t("timeOff.note")}
          hint={t("timeOff.noteHint")}
        />

        {state.status === "saved" ? (
          <p
            role="status"
            className={
              state.overlappingBookings > 0
                ? "rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning"
                : "rounded-lg bg-success-soft px-3 py-2 text-sm text-success"
            }
          >
            {state.overlappingBookings === 0
              ? t("timeOff.saved")
              : t("timeOff.savedWithOverlap", {
                  count: state.overlappingBookings,
                })}
          </p>
        ) : null}

        {state.status === "invalid" ? (
          <p
            role="alert"
            className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger"
          >
            {translateMessage(t, state.message)}
          </p>
        ) : null}

        {state.status === "gone" ? (
          <p
            role="alert"
            className="rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning"
          >
            {t("staff.gone")}
          </p>
        ) : null}

        {state.status === "error" ? (
          <p
            role="alert"
            className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger"
          >
            {t("common.saveError")}
          </p>
        ) : null}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-on-primary transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? t("common.saving") : t("timeOff.submit")}
          </button>
        </div>
      </form>
    </div>
  );
}

/**
 * A labelled date/time/text input.
 *
 * Not the shared `Field` from components/ui: that one takes a `defaultValue` and
 * is built for text, and these need `type="date"` and `type="time"` with no
 * value at all — this form always starts empty. Kept local rather than widening
 * Field's props for one screen.
 */
function DateOrTimeField({
  id,
  type,
  label,
  hint,
}: {
  id: string;
  type: "date" | "time" | "text";
  label: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-fg-secondary">
        {label}
      </label>
      <input
        id={id}
        name={id}
        type={type}
        aria-describedby={hint ? `${id}-hint` : undefined}
        // Same explicit bg/text as the shared Field and TimeInput: Tailwind's
        // preflight resets form controls to inherited colours, which is how
        // these once rendered near-white on white.
        className="rounded-lg border border-line-strong bg-surface px-3 py-2 text-base text-fg outline-none focus:border-focus focus:ring-1 focus:ring-focus"
      />
      {hint ? (
        <p id={`${id}-hint`} className="text-sm text-fg-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
