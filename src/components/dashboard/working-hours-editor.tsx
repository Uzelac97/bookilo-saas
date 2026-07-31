"use client";

import { useActionState, useState } from "react";

import {
  saveWorkingHoursAction,
  type WorkingHoursState,
} from "@/app/(dashboard)/dashboard/staff/actions";
import {
  DISPLAY_WEEK,
  WEEKDAY_LABELS,
} from "@/lib/availability/opening-hours";
import type { WorkingHoursRow } from "@/lib/db/staff";
import { formatMinuteOfDay } from "@/lib/format";

/** See the note in service-form.tsx — a "use server" module can't export this. */
const INITIAL_STATE: WorkingHoursState = { status: "idle" };

/**
 * The weekday ordering and labels come from lib/availability/opening-hours.ts
 * rather than being written again here, and that file says why: the schema's
 * 0 = Sunday numbering is storage, not presentation, and keeping the Monday-first
 * reordering in one place is what stops a second, subtly different weekday
 * mapping appearing in the UI layer. This editor and the public opening-hours
 * table must agree about which day is which, or an owner sets Monday's hours and
 * a customer reads them as Sunday's.
 *
 * They are also fixed English labels rather than Luxon's locale-dependent ones,
 * which matters here specifically: these name a recurring weekday, not a real
 * date, so they'd otherwise follow the *runtime's* locale — the inconsistency
 * recorded for Day 13 in EXECUTION-PLAN.md.
 */

/** A default interval for a day being opened, in the shape the form holds. */
const DEFAULT_START = "09:00";
const DEFAULT_END = "18:00";

/**
 * One interval as the editor holds it, keyed so React can track a row across an
 * insert or a removal.
 *
 * Times are kept as the "HH:mm" strings the inputs produce rather than as
 * minutes. Converting on every keystroke would mean converting back to render,
 * and a half-typed "0" would round-trip into something the owner didn't type.
 * The conversion happens once, on the server, in toWorkingHoursRows.
 */
type Interval = { key: string; dayOfWeek: number; start: string; end: string };

/**
 * A barber's week, editable.
 *
 * Several intervals per day are supported because the schema supports them and
 * `slotsForStaff` iterates every matching row — a lunch break is simply two
 * windows. An editor that could only hold one row per day would silently drop
 * the second on the next save, which is the failure worth avoiding here: it
 * would look like it worked.
 *
 * The whole week posts as one hidden JSON field. With a variable number of rows
 * per day, the alternative — parallel `getAll()` arrays — relies on DOM order to
 * keep three lists aligned, and a misalignment there hands one day's shift to
 * another day with nothing to notice it.
 */
export function WorkingHoursEditor({
  staffId,
  workingHours,
}: {
  staffId: string;
  workingHours: WorkingHoursRow[];
}) {
  const [intervals, setIntervals] = useState<Interval[]>(() =>
    workingHours.map((row, index) => ({
      key: `saved-${index}`,
      dayOfWeek: row.dayOfWeek,
      start: formatMinuteOfDay(row.startMinute),
      end: formatMinuteOfDay(row.endMinute),
    })),
  );
  const [nextKey, setNextKey] = useState(0);
  const [state, formAction, pending] = useActionState<
    WorkingHoursState,
    FormData
  >(saveWorkingHoursAction, INITIAL_STATE);

  function addInterval(dayOfWeek: number) {
    setIntervals((current) => [
      ...current,
      {
        key: `new-${nextKey}`,
        dayOfWeek,
        start: DEFAULT_START,
        end: DEFAULT_END,
      },
    ]);
    setNextKey((value) => value + 1);
  }

  function removeInterval(key: string) {
    setIntervals((current) => current.filter((row) => row.key !== key));
  }

  function updateInterval(key: string, patch: Partial<Interval>) {
    setIntervals((current) =>
      current.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="staffId" value={staffId} />
      {/* Validated on arrival like any other input — being our own field buys it
          no trust. The server strips the keys and converts the times. */}
      <input
        type="hidden"
        name="hours"
        value={JSON.stringify(
          intervals.map(({ dayOfWeek, start, end }) => ({
            dayOfWeek,
            start,
            end,
          })),
        )}
      />

      <ul className="flex flex-col divide-y divide-zinc-100">
        {DISPLAY_WEEK.map((dayOfWeek) => {
          const label = WEEKDAY_LABELS[dayOfWeek];
          const rows = intervals.filter(
            (interval) => interval.dayOfWeek === dayOfWeek,
          );

          return (
            <li
              key={dayOfWeek}
              className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:gap-4"
            >
              <span className="w-28 shrink-0 pt-1.5 text-sm font-medium text-zinc-700">
                {label}
              </span>

              <div className="flex flex-1 flex-col gap-2">
                {rows.length === 0 ? (
                  <span className="pt-1.5 text-sm text-zinc-400">Closed</span>
                ) : (
                  rows.map((row) => (
                    <div key={row.key} className="flex flex-wrap items-center gap-2">
                      <TimeInput
                        label={`${label} start`}
                        value={row.start}
                        onChange={(start) => updateInterval(row.key, { start })}
                      />
                      <span aria-hidden className="text-zinc-400">
                        –
                      </span>
                      <TimeInput
                        label={`${label} end`}
                        value={row.end}
                        onChange={(end) => updateInterval(row.key, { end })}
                      />
                      <button
                        type="button"
                        onClick={() => removeInterval(row.key)}
                        aria-label={`Remove ${label} ${row.start}–${row.end}`}
                        className="rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-sm text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900"
                      >
                        Remove
                      </button>
                    </div>
                  ))
                )}

                <button
                  type="button"
                  onClick={() => addInterval(dayOfWeek)}
                  className="w-fit text-sm text-zinc-500 underline-offset-4 hover:text-zinc-900 hover:underline"
                >
                  {rows.length === 0 ? "Add hours" : "Add another interval"}
                </button>
              </div>
            </li>
          );
        })}
      </ul>

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
          Something went wrong and the hours weren&rsquo;t saved. Please try again.
        </p>
      ) : null}

      {state.status === "saved" ? (
        <p
          role="status"
          className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
        >
          Hours saved.
        </p>
      ) : null}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save hours"}
        </button>
        <p className="text-sm text-zinc-500">
          A day with no hours is closed for this barber.
        </p>
      </div>
    </form>
  );
}

/**
 * A bare time input. Controlled, because the value has to reach the hidden JSON
 * field above on every keystroke — an uncontrolled input would post whatever was
 * in state when the row was created.
 */
function TimeInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <input
      type="time"
      aria-label={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      // Same explicit bg/text as the shared Field: Tailwind's preflight resets
      // form controls to inherited colours, which is how these once rendered
      // near-white on white.
      className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-base text-zinc-900 outline-none focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900"
    />
  );
}
