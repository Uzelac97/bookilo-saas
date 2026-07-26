import {
  WEEKDAY_LABELS,
  type DayOpeningHours,
} from "@/lib/availability/opening-hours";
import { formatMinuteOfDay } from "@/lib/format";

/**
 * The seven-day hours table. `days` arrives already merged and in display
 * order from mergeOpeningHours — this component does no weekday arithmetic of
 * its own, which is the point of that split.
 */
export function OpeningHours({ days }: { days: DayOpeningHours[] }) {
  return (
    <dl className="flex flex-col gap-1.5 text-sm">
      {days.map((day) => (
        <div key={day.dayOfWeek} className="flex justify-between gap-4">
          <dt className="text-zinc-500">{WEEKDAY_LABELS[day.dayOfWeek]}</dt>
          <dd className="text-right tabular-nums text-zinc-900">
            {day.intervals.length === 0 ? (
              <span className="text-zinc-400">Closed</span>
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
