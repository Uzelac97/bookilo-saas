import Link from "next/link";

import type {
  // Aliased because the component below owns the plain name. A type-only import
  // still binds the identifier locally, so `function CalendarGrid` next to an
  // unaliased import is a compile error, not a shadow.
  CalendarGrid as CalendarGridModel,
  GridColumn,
  PlacedBooking,
} from "@/lib/dashboard/calendar-layout";
import type { DashboardBooking } from "@/lib/db/bookings";
import { formatTimeRange } from "@/lib/format";

/**
 * The three lengths the layout is built from.
 *
 * Kept as CSS strings and fed to `calc()` rather than multiplied in JS so the
 * grid template, the wrapper's minimum width and the hour rules' left edge can
 * only ever agree — a mismatch between them is a calendar whose lines don't
 * meet its columns.
 */
const AXIS_WIDTH = "4rem";
const MIN_COLUMN_WIDTH = "9rem";

/**
 * Fixed, because the blocks are positioned in percentages: a percentage height
 * resolves against nothing on an auto-height parent, so a `h-auto` grid would
 * collapse every appointment to zero. 720px is twelve hours at a readable 60px
 * an hour, and the axis is elastic anyway — a six-hour day just gets roomier
 * rows rather than a shorter grid.
 */
const GRID_HEIGHT = "h-[720px]";

/**
 * How each status reads on a block. Same semantics as today-list.tsx — CONFIRMED
 * is the plain look because it is nearly every block, and badging all of them
 * would bury the two that need attention.
 */
const STATUS_BLOCK_STYLES: Record<DashboardBooking["status"], string> = {
  CONFIRMED: "border-zinc-300 bg-white text-zinc-900",
  CANCELLED: "border-zinc-200 bg-zinc-50 text-zinc-500 line-through",
  COMPLETED: "border-emerald-200 bg-emerald-50 text-emerald-900",
  NO_SHOW: "border-amber-200 bg-amber-100 text-amber-900",
};

/**
 * Announced to a screen reader, not drawn. The visual difference between these
 * is colour, and colour alone is not a status.
 */
const STATUS_LABELS: Record<DashboardBooking["status"], string | null> = {
  CONFIRMED: null,
  CANCELLED: "Cancelled",
  COMPLETED: "Done",
  NO_SHOW: "No-show",
};

/**
 * The owner's calendar: a time axis down the left, one column per barber (day
 * view) or per day (week view).
 *
 * Dumb by design, the same contract as components/booking/date-strip.tsx. Every
 * minute, percentage and lane arrives already computed by
 * lib/dashboard/calendar-layout.ts, which is where the wall-clock rules live and
 * where they are tested. Nothing here does date arithmetic — a second copy of
 * that logic in a component is exactly how the two would drift apart at a DST
 * boundary and put an afternoon on the wrong rows.
 */
export function CalendarGrid({
  grid,
  timezone,
}: {
  grid: CalendarGridModel;
  timezone: string;
}) {
  if (grid.columns.length === 0) return <CalendarEmptyState />;

  const template = `${AXIS_WIDTH} repeat(${grid.columns.length}, minmax(0, 1fr))`;

  return (
    // No scrollbar-hide here, deliberately — see the note on that utility in
    // app/globals.css: it is only for content that advertises its own overflow.
    // The ‹ › controls next to this grid move it through *time*, not sideways,
    // so on a narrow screen the scrollbar is the only thing saying that Saturday
    // and Sunday exist off the right-hand edge.
    <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
      <div
        // Below this width the columns stop shrinking and the wrapper — headers,
        // hour rules and all — grows past the viewport into the scroll above,
        // instead of each row overflowing on its own and tearing when scrolled.
        style={{
          minWidth: `calc(${AXIS_WIDTH} + ${grid.columns.length} * ${MIN_COLUMN_WIDTH})`,
        }}
        // Room for the first and last hour labels, which are centred on rules
        // that sit flush against the top and bottom of the grid.
        className="pb-3"
      >
        <div
          style={{ gridTemplateColumns: template }}
          className="grid border-b border-zinc-200"
        >
          <div aria-hidden="true" />
          {grid.columns.map((column) => (
            <ColumnHeader key={column.key} column={column} />
          ))}
        </div>

        <div
          style={{ gridTemplateColumns: template }}
          className={`relative grid ${GRID_HEIGHT}`}
        >
          {grid.hourMarks.map((mark) => (
            <div
              key={mark.minute}
              aria-hidden="true"
              style={{ top: `${mark.topPercent}%`, left: AXIS_WIDTH }}
              className="absolute right-0 border-t border-zinc-100"
            />
          ))}

          <div className="relative border-r border-zinc-200">
            {grid.hourMarks.map((mark) => (
              <span
                key={mark.minute}
                style={{ top: `${mark.topPercent}%` }}
                className="absolute right-2 -translate-y-1/2 font-mono text-[11px] tabular-nums text-zinc-400"
              >
                {mark.label}
              </span>
            ))}
          </div>

          {grid.columns.map((column) => (
            <ColumnBody key={column.key} column={column} timezone={timezone} />
          ))}
        </div>
      </div>
    </div>
  );
}

function ColumnHeader({ column }: { column: GridColumn }) {
  return (
    <div
      id={headerId(column.key)}
      className={[
        "flex min-w-0 flex-col gap-0.5 px-2 py-2.5 text-sm",
        // `highlight` is today in the week view.
        column.highlight ? "bg-zinc-100 font-semibold text-zinc-900" : "",
        // `muted` is a barber who no longer works at the shop but still has
        // appointments on the books — those bookings are real and cannot be
        // hidden, so the column is dimmed rather than dropped.
        column.muted ? "text-zinc-400" : "",
        !column.highlight && !column.muted ? "text-zinc-900" : "",
      ].join(" ")}
    >
      <span className="truncate">{column.label}</span>
      {column.sublabel ? (
        <span
          className={[
            "truncate text-xs",
            column.muted ? "text-zinc-400" : "text-zinc-500",
          ].join(" ")}
        >
          {column.sublabel}
        </span>
      ) : null}
    </div>
  );
}

/**
 * One column's appointments. An `<ol>` because assignLanes hands them over in
 * start-time order, so the DOM order a screen reader walks is the chronological
 * one — the visual top-to-bottom order, not an accident of the query.
 *
 * `aria-labelledby` points at the header so "Marco" or "Tue 28" is announced
 * with the list rather than sitting in a separate cell that reads as unrelated.
 */
function ColumnBody({
  column,
  timezone,
}: {
  column: GridColumn;
  timezone: string;
}) {
  return (
    <ol
      aria-labelledby={headerId(column.key)}
      className={[
        "relative border-r border-zinc-200 last:border-r-0",
        column.highlight ? "bg-zinc-50" : "",
      ].join(" ")}
    >
      {column.bookings.map((placed) => (
        <BookingBlock
          key={placed.booking.id}
          placed={placed}
          timezone={timezone}
        />
      ))}
    </ol>
  );
}

function BookingBlock({
  placed,
  timezone,
}: {
  placed: PlacedBooking;
  timezone: string;
}) {
  const { booking, lane, laneCount } = placed;
  const statusLabel = STATUS_LABELS[booking.status];
  // MANUAL means the owner typed it in at the counter rather than a customer
  // booking online.
  const walkIn = booking.source === "MANUAL";

  return (
    <li
      style={{
        top: `${placed.topPercent}%`,
        height: `${placed.heightPercent}%`,
        // laneCount > 1 means genuinely overlapping appointments on one barber.
        // That is possible, not a data error: the no_overlapping_bookings
        // exclusion constraint only covers CONFIRMED and COMPLETED, so marking
        // someone a no-show reopens their slot and a walk-in can be booked
        // straight over it. Splitting the width is what keeps the newer
        // appointment from hiding behind the one it replaced.
        left: `${(lane / laneCount) * 100}%`,
        width: `${100 / laneCount}%`,
      }}
      // px-px on the li, borders on the box inside it: the gap between adjacent
      // lanes comes out of the block, so the lane arithmetic above stays in
      // clean percentages.
      className="absolute px-px pb-px"
    >
      <div
        className={[
          "flex h-full flex-col overflow-hidden rounded-lg border px-1.5 py-1 text-[11px] leading-tight",
          STATUS_BLOCK_STYLES[booking.status],
          // A "Walk-in" badge like today-list's costs a whole line, and a
          // 15-minute block is barely two lines tall — the accent edge costs no
          // vertical space at all. It is decoration only, hence the sr-only text
          // below: nothing here may depend on noticing a 3px stripe.
          walkIn ? "border-l-4" : "",
        ].join(" ")}
      >
        {/* Every line truncates and the box hides its overflow, so a short
            appointment degrades to just its time rather than spilling its
            customer's name across the block below it. */}
        <span className="truncate font-mono tabular-nums">
          {formatTimeRange(booking.startAt, booking.endAt, timezone)}
        </span>
        <span className="truncate font-medium">{booking.customer.name}</span>
        <span className="truncate opacity-75">{booking.service.name}</span>

        {statusLabel ? <span className="sr-only">{statusLabel}</span> : null}
        {walkIn ? <span className="sr-only">Walk-in</span> : null}
      </div>
    </li>
  );
}

/** Shown when the shop has no barbers yet — a new shop's calendar, not an error. */
function CalendarEmptyState() {
  return (
    <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-8 text-center">
      <p className="font-medium text-zinc-900">No barbers yet</p>
      <p className="mt-1 text-sm text-zinc-500">
        Add someone on the{" "}
        <Link
          href="/dashboard/staff"
          className="font-medium text-zinc-900 underline underline-offset-4"
        >
          staff page
        </Link>{" "}
        and their day shows up here.
      </p>
    </div>
  );
}

/** Column keys are staff ids and ISO dates, both safe in an id attribute. */
function headerId(key: string): string {
  return `calendar-column-${key}`;
}
