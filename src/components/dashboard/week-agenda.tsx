import type { DashboardBooking } from "@/lib/db/bookings";
import { formatBookingDate } from "@/lib/format";

import { TodayList } from "./today-list";

/**
 * The week, as a vertical list of days, for viewports too narrow for the grid.
 *
 * The grid's floor is a 4rem axis plus seven columns at 9rem — 1072px, which on
 * a phone is nearly three screens of horizontal scrolling. It doesn't break, it
 * just isn't usable, and "how busy is next week" is a question an owner asks
 * precisely when they're away from the desk.
 *
 * This carries no geometry at all: no positions, no lanes, no axis, no
 * buildWeekGrid. A list doesn't need a booking's height, only its order, so the
 * page hands over the same `bookings` array the grid was built from and this
 * groups it. That's also why it costs so little — the rows are TodayList's,
 * unchanged, so a booking reads identically here and on the overview.
 *
 * It renders no per-barber accent colour either, deliberately: a full-width row
 * has room for the barber's name in words, which is what the colour on a block
 * is standing in for in the first place.
 */
export function WeekAgenda({
  days,
  timezone,
  todayDate,
  now,
}: {
  /** One entry per day of the week, in order, already grouped by the page. */
  days: { date: string; bookings: DashboardBooking[] }[];
  timezone: string;
  /** The shop's today, resolved server-side — this does no date math. */
  todayDate: string;
  now: Date;
}) {
  return (
    <div className="flex flex-col gap-5">
      {days.map((day) => (
        <section key={day.date} className="flex flex-col gap-2">
          <h3 className="flex items-baseline gap-2 text-sm font-semibold tracking-tight text-zinc-900">
            {formatBookingDate(day.date, timezone)}
            {day.date === todayDate ? (
              <span className="rounded-full bg-zinc-900 px-2 py-0.5 text-xs font-medium text-white">
                Today
              </span>
            ) : null}
            <span className="ml-auto text-xs font-normal text-zinc-400 tabular-nums">
              {day.bookings.length > 0 ? day.bookings.length : null}
            </span>
          </h3>

          {day.bookings.length === 0 ? (
            // Empty days are kept rather than skipped: "Friday is quiet" is
            // information, and a list that silently omitted it would read as a
            // shorter week rather than an emptier one.
            <p className="rounded-xl border border-dashed border-zinc-200 px-3 py-2 text-sm text-zinc-400">
              Nothing booked
            </p>
          ) : (
            <TodayList
              bookings={day.bookings}
              timezone={timezone}
              now={now}
            />
          )}
        </section>
      ))}
    </div>
  );
}
