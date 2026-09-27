import type { DayOpeningHours } from "@/lib/availability/opening-hours";
import { formatMinuteOfDay } from "@/lib/format";
import { getT } from "@/lib/i18n/server";
import { weekdayName } from "@/lib/i18n/weekdays";

/**
 * The seven-day hours table. `days` arrives already merged and in display
 * order from mergeOpeningHours — this component does no weekday arithmetic of
 * its own, which is the point of that split.
 */
export async function OpeningHours({ days }: { days: DayOpeningHours[] }) {
  const t = await getT();

  return (
    <dl className="flex flex-col gap-1.5 text-sm">
      {days.map((day) => (
        <div key={day.dayOfWeek} className="flex justify-between gap-4">
          <dt className="text-fg-muted">{weekdayName(t, day.dayOfWeek)}</dt>
          <dd className="text-right tabular-nums text-fg">
            {day.intervals.length === 0 ? (
              <span className="text-fg-faint">{t("shop.closed")}</span>
            ) : (
              day.intervals
                .map(
                  (interval) =>
                    `${formatMinuteOfDay(interval.startMinute)} – ${formatMinuteOfDay(interval.endMinute)}`,
                )
                .join(", ")
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}
