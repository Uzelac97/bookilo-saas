"use client";

import { useActionState, useRef, useState } from "react";

import {
  addTimeOffAction,
  deleteTimeOffAction,
  type TimeOffState,
} from "@/app/(dashboard)/dashboard/staff/actions";
import type { TimeOffRow } from "@/lib/db/staff";
import { formatTimeOffRange } from "@/lib/format";

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
  const [allDay, setAllDay] = useState(true);
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState<TimeOffState, FormData>(
    addTimeOffAction,
    INITIAL_STATE,
  );

  return (
    <div className="flex flex-col gap-5">
      {timeOff.length === 0 ? (
        <p className="text-sm text-zinc-500">
          {staffName} isn&rsquo;t marked away for anything yet.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-zinc-100">
          {timeOff.map((row) => (
            <li
              key={row.id}
              className="flex flex-wrap items-center justify-between gap-3 py-2.5"
            >
              <div className="flex flex-col">
                <span className="text-sm font-medium text-zinc-900">
                  {formatTimeOffRange(row.startAt, row.endAt, timezone)}
                </span>
                {row.reason ? (
                  <span className="text-sm text-zinc-500">{row.reason}</span>
                ) : null}
              </div>

              {/* A real delete, unlike staff and services — nothing references a
                  TimeOff row, so removing one just reopens the time. */}
              <form action={deleteTimeOffAction}>
                <input type="hidden" name="timeOffId" value={row.id} />
                <input type="hidden" name="staffId" value={staffId} />
                <button
                  type="submit"
                  className="rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-sm text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900"
                >
                  Remove
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}

      <form
        ref={formRef}
        action={formAction}
        className="flex flex-col gap-4 border-t border-zinc-100 pt-5"
      >
        <input type="hidden" name="staffId" value={staffId} />
        {/* The toggle is client state, so its value has to be posted explicitly —
            an unchecked checkbox posts nothing at all. */}
        <input type="hidden" name="allDay" value={String(allDay)} />

        <label className="flex w-fit items-center gap-2 text-sm text-zinc-700">
          <input
            type="checkbox"
            checked={allDay}
            onChange={(event) => setAllDay(event.target.checked)}
            className="size-4 rounded border-zinc-300"
          />
          Away all day
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <DateOrTimeField
            id="startDate"
            type="date"
            label={allDay ? "First day away" : "Day"}
          />

          {allDay ? (
            <DateOrTimeField
              id="endDate"
              type="date"
              label="Last day away"
              hint="Leave empty for a single day."
            />
          ) : (
            <div className="flex items-end gap-2">
              <DateOrTimeField id="startTime" type="time" label="From" />
              <DateOrTimeField id="endTime" type="time" label="To" />
            </div>
          )}
        </div>

        <DateOrTimeField
          id="reason"
          type="text"
          label="Note"
          hint="Optional, and only ever shown to you."
        />

        {state.status === "saved" ? (
          <p
            role="status"
            className={
              state.overlappingBookings > 0
                ? "rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900"
                : "rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
            }
          >
            {state.overlappingBookings === 0
              ? "Time off saved."
              : state.overlappingBookings === 1
                ? "Time off saved — but 1 appointment already booked falls inside it. It stays on the calendar; call that customer to move it."
                : `Time off saved — but ${state.overlappingBookings} appointments already booked fall inside it. They stay on the calendar; call those customers to move them.`}
          </p>
        ) : null}

        {state.status === "invalid" ? (
          <p
            role="alert"
            className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"
          >
            {state.message}
          </p>
        ) : null}

        {state.status === "gone" ? (
          <p
            role="alert"
            className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900"
          >
            That barber no longer exists. Reload the page.
          </p>
        ) : null}

        {state.status === "error" ? (
          <p
            role="alert"
            className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"
          >
            Something went wrong and nothing was saved. Please try again.
          </p>
        ) : null}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? "Saving…" : "Add time off"}
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
      <label htmlFor={id} className="text-sm font-medium text-zinc-700">
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
        className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base text-zinc-900 outline-none focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900"
      />
      {hint ? (
        <p id={`${id}-hint`} className="text-sm text-zinc-500">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
