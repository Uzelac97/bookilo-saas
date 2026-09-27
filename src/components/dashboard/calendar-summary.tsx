import type { DaySummary } from "@/lib/dashboard/today-summary";
import { formatPrice, formatSlotTime } from "@/lib/format";
import { getDashboardT } from "@/lib/i18n/server";

import { SummaryCell } from "./today-list";

/**
 * How wide the sidebar is. Exported because the page has to add it to the
 * container's width before centring, or the pair sits off-centre by half a
 * sidebar.
 */
export const CALENDAR_ASIDE_WIDTH = "18rem";
/**
 * The gap between the grid and the sidebar, same reason. Must stay equal to the
 * `gap-6` on the row that lays those two out in dashboard/calendar/page.tsx —
 * the width calculation and the actual gap are the same measurement, and if
 * they disagree the pair is centred wrongly by the difference.
 */
export const CALENDAR_ASIDE_GAP = "1.5rem";

/**
 * The three figures for whatever the calendar is currently showing, stacked.
 *
 * Runs on the same summariseDay the overview uses, over the range the page has
 * already fetched — so a week view summarises the week without needing its own
 * query or its own arithmetic.
 *
 * The copy is the part that couldn't be reused. TodaySummary is written for
 * today and says so ("nothing left today"), which is wrong on a view of next
 * Thursday and worse on one of last Monday. Everything here is true of any
 * range, which is the only way a caption on an arbitrary date can be.
 *
 * `next` needs no past/future branch: summariseDay only ever returns a booking
 * that hasn't started yet, so a range entirely in the past yields null on its
 * own rather than needing to be told.
 */
export async function CalendarSummary({
  summary,
  timezone,
}: {
  summary: DaySummary;
  timezone: string;
}) {
  const t = await getDashboardT();

  return (
    <div className="flex flex-col gap-px overflow-hidden rounded-2xl border border-line bg-subtle-strong">
      <SummaryCell
        label={t("summary.booked")}
        value={String(summary.booked)}
        detail={t("summary.appointments", { count: summary.booked })}
      />
      <SummaryCell
        label={t("summary.next")}
        value={
          summary.next ? formatSlotTime(summary.next.startAt, timezone) : "—"
        }
        detail={
          summary.next
            ? summary.next.customer.name
            : t("summary.nothingUpcoming")
        }
      />
      <SummaryCell
        label={t("summary.bookedValue")}
        value={formatPrice(summary.revenueMinorUnits)}
        detail={t("summary.exclNoShows")}
      />
    </div>
  );
}
