"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { useTransition } from "react";

import type { CalendarView } from "@/lib/dashboard/calendar-range";

/**
 * The only component on the calendar that writes the URL.
 *
 * Same rule as components/booking/booking-flow.tsx: **the URL carries what the
 * server needs to render.** `date` and `view` decide which bookings get fetched
 * and how they get laid out, so both live in searchParams and changing either is
 * a navigation — the page is a server component and rebuilds the grid from the
 * database each time. Nothing is fetched on the client, so there is no cache
 * here to invalidate and no skeleton to show: `useTransition` gives us the
 * pending flag while the server render is in flight, and the previous grid stays
 * on screen (dimmed) instead of the layout collapsing under the owner.
 *
 * Every date this component navigates to is precomputed by the server and
 * arrives as a prop. It derives none of them, and deliberately imports nothing
 * from lib/availability/booking-options: those helpers are clamped to the
 * customer-facing booking window, and an owner must be able to look at last
 * month.
 */
export function CalendarNav({
  view,
  heading,
  previousDate,
  nextDate,
  todayDate,
  atToday,
  children,
}: {
  view: CalendarView;
  /** Already formatted by the server: "Tue, 28 Jul" or "27 Jul – 2 Aug". */
  heading: string;
  previousDate: string;
  nextDate: string;
  todayDate: string;
  /** True when the view already contains the shop's today. */
  atToday: boolean;
  /** The grid, so it can be dimmed while the next one is being rendered. */
  children?: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  function navigate(changes: Record<string, string>) {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(changes)) {
      next.set(key, value);
    }

    startTransition(() => {
      // push, not booking-flow's replace: this is a screen an owner moves around
      // in, and back returning to the week they were just looking at is what
      // every other calendar does. The public flow replaces because paging dates
      // there is one step of a booking, not a destination.
      router.push(`${pathname}?${next.toString()}`, { scroll: false });
    });
  }

  const unit = view === "week" ? "week" : "day";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div className="flex items-center gap-2">
          <StepButton
            label={`Previous ${unit}`}
            glyph="‹"
            disabled={pending}
            onClick={() => navigate({ date: previousDate, view })}
          />
          <StepButton
            label={`Next ${unit}`}
            glyph="›"
            disabled={pending}
            onClick={() => navigate({ date: nextDate, view })}
          />
          <button
            type="button"
            disabled={atToday || pending}
            onClick={() => navigate({ date: todayDate, view })}
            className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-900 transition-colors hover:border-zinc-400 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-zinc-200"
          >
            Today
          </button>

          {/* Announced on change: the ‹ › buttons keep their own labels, so
              without this the only feedback for a step is visual. */}
          <h2
            aria-live="polite"
            className="ml-1 text-base font-semibold tracking-tight text-zinc-900"
          >
            {heading}
          </h2>
        </div>

        <div
          role="group"
          aria-label="Calendar view"
          className="flex gap-1 rounded-xl border border-zinc-200 bg-white p-1"
        >
          <ViewButton
            label="Day"
            target="day"
            current={view}
            disabled={pending}
            // Only `view` changes here — `date` is carried through untouched by
            // the URLSearchParams copy above rather than re-sent from a prop.
            // Dropping it and letting the server re-resolve looks simpler and is
            // wrong: resolveCalendarDate falls back to the shop's today when
            // `?date=` is absent, so toggling the view while browsing next month
            // would silently snap back to this week.
            onSelect={() => navigate({ view: "day" })}
          />
          <ViewButton
            label="Week"
            target="week"
            current={view}
            disabled={pending}
            onSelect={() => navigate({ view: "week" })}
          />
        </div>
      </div>

      {children ? (
        <div
          className={[
            "transition-opacity",
            pending ? "opacity-50" : "opacity-100",
          ].join(" ")}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}

function StepButton({
  label,
  glyph,
  disabled,
  onClick,
}: {
  label: string;
  glyph: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="shrink-0 rounded-lg border border-zinc-200 bg-white px-2.5 py-2 text-lg leading-none text-zinc-600 transition-colors hover:border-zinc-400 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-zinc-200"
    >
      {glyph}
    </button>
  );
}

function ViewButton({
  label,
  target,
  current,
  disabled,
  onSelect,
}: {
  label: string;
  target: CalendarView;
  current: CalendarView;
  disabled: boolean;
  onSelect: () => void;
}) {
  const selected = target === current;

  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onSelect}
      className={[
        "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed",
        selected
          ? "bg-zinc-900 text-white"
          : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900",
      ].join(" ")}
    >
      {label}
    </button>
  );
}
