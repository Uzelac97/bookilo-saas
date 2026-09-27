"use client";

import type { StripDay } from "@/lib/availability/booking-options";
import { formatStripDay } from "@/lib/format";
import { useLocale, useT } from "@/lib/i18n/client";

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
  const t = useT();
  const locale = useLocale();

  return (
    <div className="flex items-center gap-2">
      <PageButton
        label={t("book.previousWeek")}
        glyph="‹"
        disabled={!canGoBack || pending}
        onClick={() => onPage(-1)}
      />

      <div
        role="group"
        aria-label={t("book.chooseDate")}
        // scrollbar-hide is ours, defined in app/globals.css — it hides the bar
        // without touching the scrolling. The ‹ › buttons flanking this strip
        // are what tell the customer there is more week either side.
        className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto scrollbar-hide"
      >
        {days.map((day) => {
          const { weekday, dayOfMonth } = formatStripDay(day.date, timezone, locale);
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
                "flex min-h-14 min-w-13 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl border px-2 py-2.5 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
                selected
                  ? "border-primary bg-primary text-on-primary"
                  : day.bookable
                    ? "border-line bg-surface text-fg hover:border-line-stronger"
                    : "cursor-not-allowed border-line-faint bg-canvas text-fg-disabled",
              ].join(" ")}
            >
              <span className="text-xs font-medium uppercase tracking-wide opacity-70">
                {day.isToday ? t("nav.today") : weekday}
              </span>
              <span className="text-base font-semibold tabular-nums">
                {dayOfMonth}
              </span>
            </button>
          );
        })}
      </div>

      <PageButton
        label={t("book.nextWeek")}
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
      className="flex min-h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-line bg-surface text-lg leading-none text-fg-tertiary transition-colors hover:border-line-stronger focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-line"
    >
      {glyph}
    </button>
  );
}
