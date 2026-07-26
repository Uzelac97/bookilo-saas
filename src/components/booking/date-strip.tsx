"use client";

import type { StripDay } from "@/lib/availability/booking-options";
import { formatStripDay } from "@/lib/format";

/**
 * The seven-day date picker. Dumb by design: `days` arrives already built by
 * dateStrip, which owns the calendar arithmetic and the horizon rules, so this
 * component does no date math of its own.
 */
export function DateStrip({
  days,
  selectedDate,
  timezone,
  canGoBack,
  canGoForward,
  pending,
  onSelect,
  onPage,
}: {
  days: StripDay[];
  selectedDate: string;
  timezone: string;
  canGoBack: boolean;
  canGoForward: boolean;
  pending: boolean;
  onSelect: (date: string) => void;
  onPage: (weeks: number) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <PageButton
        label="Previous week"
        glyph="‹"
        disabled={!canGoBack || pending}
        onClick={() => onPage(-1)}
      />

      <div
        role="group"
        aria-label="Choose a date"
        className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto"
      >
        {days.map((day) => {
          const { weekday, dayOfMonth } = formatStripDay(day.date, timezone);
          const selected = day.date === selectedDate;

          return (
            <button
              key={day.date}
              type="button"
              // Not a plain `disabled`: an unbookable day should still be
              // readable in the strip, it just can't be chosen.
              aria-disabled={!day.bookable}
              aria-pressed={selected}
              disabled={!day.bookable || pending}
              onClick={() => onSelect(day.date)}
              className={[
                "flex min-w-13 flex-1 flex-col items-center gap-0.5 rounded-xl border px-2 py-2.5 text-sm transition-colors",
                selected
                  ? "border-zinc-900 bg-zinc-900 text-white"
                  : day.bookable
                    ? "border-zinc-200 bg-white text-zinc-900 hover:border-zinc-400"
                    : "cursor-not-allowed border-zinc-100 bg-zinc-50 text-zinc-300",
              ].join(" ")}
            >
              <span className="text-xs font-medium uppercase tracking-wide opacity-70">
                {day.isToday ? "Today" : weekday}
              </span>
              <span className="text-base font-semibold tabular-nums">
                {dayOfMonth}
              </span>
            </button>
          );
        })}
      </div>

      <PageButton
        label="Next week"
        glyph="›"
        disabled={!canGoForward || pending}
        onClick={() => onPage(1)}
      />
    </div>
  );
}

function PageButton({
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
