import Link from "next/link";

import type {
  // Aliased because the component below owns the plain name. A type-only import
  // still binds the identifier locally, so `function CalendarGrid` next to an
  // unaliased import is a compile error, not a shadow.
  CalendarGrid as CalendarGridModel,
  GridColumn,
  PlacedBooking,
} from "@/lib/dashboard/calendar-layout";
import { staffColor } from "@/lib/dashboard/staff-colors";
import type { DashboardBooking } from "@/lib/db/bookings";
import { formatSlotTime, formatTimeRange, initials } from "@/lib/format";

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
 * How wide a column is allowed to get.
 *
 * The columns used to be `minmax(0, 1fr)` inside a fixed max-width page, which
 * put the sizing on the wrong end of the problem: the container was constant
 * while the column count swings from two barbers to a seven-day week. At seven
 * that left ~149px a column and the grid looked cramped on a wide monitor; at
 * two it produced 520px columns holding a 27px-tall booking block, which is not
 * "roomy", just empty.
 *
 * Bounding the column instead makes it self-correcting at any staff count. A
 * week uses the room it needs, a two-barber day stops growing and leaves honest
 * whitespace, and the page cap only has to be large enough for the widest case
 * (axis + seven columns) rather than tuned to a guess about how many barbers a
 * shop has.
 */
const MAX_COLUMN_WIDTH = "16rem";

/**
 * The card's 1px border, left and right.
 *
 * Small and load-bearing: the border sits outside the grid's content box, so a
 * caller sizing a container to `axis + columns` alone lands 2px short, the card
 * hits its own `max-w-full`, and the grid gets a 2px horizontal scrollbar on a
 * layout that is otherwise an exact fit.
 */
const CARD_BORDER = "2px";

/**
 * How wide this card wants to be, given its column count — border included.
 *
 * Exported so the page can size and centre the whole calendar column to the
 * grid rather than leaving a wide container with a small card adrift at one end
 * of it. It lives here because this is the file that knows the axis width, the
 * column cap and the border, and a second copy of that arithmetic in the page
 * would be wrong the first time any of the three changed.
 *
 * Returns a CSS length, not a number: the parts are rem and px and only the
 * browser knows the root font size.
 */
export function calendarCardWidth(columnCount: number): string {
  return `calc(${AXIS_WIDTH} + ${columnCount} * ${MAX_COLUMN_WIDTH} + ${CARD_BORDER})`;
}

/**
 * The chrome and text metrics each density tier is allowed, and the content it
 * renders. The thresholds that pick a tier live in lib/dashboard/calendar-layout
 * next to the geometry that produces the height; these are the other half of
 * that contract, and the two must be read together — the numbers in
 * FULL_MIN_PX/COMPACT_MIN_PX are derived from exactly this padding and this
 * line height. Change the padding here and the thresholds there are wrong.
 *
 *   full     3 lines, py-1     (8px)  — time range / customer / service
 *   compact  2 lines, py-0.5   (4px)  — time + customer / service
 *   minimal  1 line,  py-0     (0px)  — time + customer, at 10px
 *   sliver   no text                  — a bar, with everything on hover
 *
 * Detail is dropped from the bottom up because that is the order it stops
 * earning its space: the block's position on the axis already says roughly when
 * the appointment is, so the customer's name is the last thing to go.
 */
const DENSITY_STYLES: Record<PlacedBooking["density"], string> = {
  full: "pr-1.5 pl-2.5 py-1 text-[11px] leading-tight",
  compact: "pr-1.5 pl-2.5 py-0.5 text-[11px] leading-tight",
  minimal: "pr-1.5 pl-2.5 text-[10px] leading-none",
  sliver: "",
};

/**
 * The barber's accent bar. 4px wide, which is why the tiers above use pl-2.5
 * (10px) rather than px-1.5 — text starting at 6px would sit on top of it.
 *
 * Its own element rather than a `border-l-*` colour, so it cannot end up
 * fighting the status treatment's `border-*` over the same longhand property.
 * See the note in lib/dashboard/staff-colors.ts.
 */
const ACCENT_WIDTH = "w-1";

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
  staffColors,
  showBarber,
}: {
  grid: CalendarGridModel;
  timezone: string;
  /** Staff id -> accent class, from lib/dashboard/staff-colors. */
  staffColors: Record<string, string>;
  /**
   * Whether a block names its barber.
   *
   * True for the week view, where a column is a day and the barber is otherwise
   * only recoverable from the hover title. False for the day view, where the
   * column header already says it and initials on every block would be noise.
   * The accent colour renders either way — in the day view as reinforcement.
   */
  showBarber: boolean;
}) {
  if (grid.columns.length === 0) return <CalendarEmptyState />;

  const template = `${AXIS_WIDTH} repeat(${grid.columns.length}, minmax(${MIN_COLUMN_WIDTH}, ${MAX_COLUMN_WIDTH}))`;

  return (
    // No scrollbar-hide here, deliberately — see the note on that utility in
    // app/globals.css: it is only for content that advertises its own overflow.
    // The ‹ › controls next to this grid move it through *time*, not sideways,
    // so on a narrow screen the scrollbar is the only thing saying that Saturday
    // and Sunday exist off the right-hand edge.
    //
    // w-fit so the card hugs the grid rather than stretching to the page. Now
    // that columns stop at MAX_COLUMN_WIDTH, a full-width card would frame a
    // two-barber day in half a screen of empty border — the same wasted space
    // the column cap exists to remove, just moved outside the grid. max-w-full
    // keeps fit-content from exceeding the viewport, which is what leaves the
    // overflow for the scroll to handle.
    //
    // mx-auto because the page's minimum width can exceed what this card wants:
    // a two-barber day is ~578px inside a 64rem column. Left-aligned, that floor
    // would simply put the emptiness back on the right-hand side, which is the
    // thing it was added to avoid. Centred, the slack is split evenly and the
    // card reads as deliberately compact instead of unfinished.
    <div className="mx-auto w-fit max-w-full overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
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
          // The height is computed rather than a fixed class because the blocks
          // are positioned in percentages, which resolve against nothing on an
          // auto-height parent — and because an hour must be the same number of
          // pixels for every tenant, whatever their opening hours. See
          // CALENDAR_PX_PER_HOUR.
          style={{ gridTemplateColumns: template, height: `${grid.heightPx}px` }}
          className="relative grid"
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
            <ColumnBody
              key={column.key}
              column={column}
              timezone={timezone}
              staffColors={staffColors}
              showBarber={showBarber}
            />
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
  staffColors,
  showBarber,
}: {
  column: GridColumn;
  timezone: string;
  staffColors: Record<string, string>;
  showBarber: boolean;
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
          staffColors={staffColors}
          showBarber={showBarber}
        />
      ))}
    </ol>
  );
}

function BookingBlock({
  placed,
  timezone,
  staffColors,
  showBarber,
}: {
  placed: PlacedBooking;
  timezone: string;
  staffColors: Record<string, string>;
  showBarber: boolean;
}) {
  const { booking, lane, laneCount } = placed;
  const statusLabel = STATUS_LABELS[booking.status];
  // MANUAL means the owner typed it in at the counter rather than a customer
  // booking online.
  const walkIn = booking.source === "MANUAL";

  /**
   * Everything about the appointment, in one string.
   *
   * Used three times over, which is the point: as the block's `title` so a
   * mouse can recover whatever the tier dropped, as the accessible description
   * so a screen reader never sees the abridged version, and as the entire
   * content of a `sliver`. One source, so the short tiers can't quietly say
   * something different from the tall ones.
   */
  const description = [
    formatTimeRange(booking.startAt, booking.endAt, timezone),
    booking.customer.name,
    booking.service.name,
    statusLabel,
    walkIn ? "Walk-in" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  /**
   * The barber's initials, leading the first line in the week view.
   *
   * Leading rather than trailing because the line truncates from the right: put
   * at the end, this is the first thing a long service name would eat, and it is
   * the one datum the week view can't get from anywhere else on screen.
   *
   * It exists alongside the accent colour rather than instead of it. Colour is
   * the glanceable channel and initials the reliable one — a palette of eight
   * hues is not something to ask a colourblind owner to distinguish, and two
   * barbers' accents can end up adjacent in a single column.
   */
  const barber = showBarber ? (
    <span className="pr-1 font-semibold opacity-70">
      {initials(booking.staff.name)}
    </span>
  ) : null;

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
        // Recovers on hover whatever the tier had no room to draw. Cheap, and
        // the only thing standing between a sliver and an unidentifiable bar.
        title={description}
        className={[
          "relative flex h-full flex-col overflow-hidden rounded-lg border",
          DENSITY_STYLES[placed.density],
          STATUS_BLOCK_STYLES[booking.status],
          // A dashed outline, now that the left edge belongs to the barber's
          // accent. A "Walk-in" badge like today-list's costs a whole line and a
          // 15-minute block only has one, so this stays a border treatment —
          // decoration only, which is why `description` also says it in words.
          walkIn ? "border-dashed" : "",
        ].join(" ")}
      >
        {/* The barber, as colour. Absolutely positioned rather than a border so
            it survives at `sliver` density, where the block has no padding and
            no text and this bar is the only thing identifying whose it is. */}
        <span
          aria-hidden="true"
          className={`absolute inset-y-0 left-0 ${ACCENT_WIDTH} ${staffColor(staffColors, booking.staff.id)}`}
        />
        {/* The complete description at every density, so what a screen reader
            gets never depends on how long the appointment happens to be. The
            visible text below is hidden from it precisely because it is the
            abridged version of this. */}
        <span className="sr-only">{description}</span>

        {/* Every line still truncates horizontally for a long name. What the
            tiers add is the vertical half of the same problem, which `truncate`
            has nothing to say about. */}
        <span aria-hidden="true" className="contents">
          {placed.density === "full" ? (
            <>
              <span className="truncate">
                {barber}
                <span className="font-mono tabular-nums">
                  {formatTimeRange(booking.startAt, booking.endAt, timezone)}
                </span>
              </span>
              <span className="truncate font-medium">
                {booking.customer.name}
              </span>
              <span className="truncate opacity-75">
                {booking.service.name}
              </span>
            </>
          ) : placed.density === "compact" ? (
            <>
              <span className="truncate">
                {barber}
                <span className="font-mono tabular-nums">
                  {formatSlotTime(booking.startAt, timezone)}
                </span>{" "}
                <span className="font-medium">{booking.customer.name}</span>
              </span>
              <span className="truncate opacity-75">
                {booking.service.name}
              </span>
            </>
          ) : placed.density === "minimal" ? (
            <span className="truncate">
              {barber}
              <span className="font-mono tabular-nums">
                {formatSlotTime(booking.startAt, timezone)}
              </span>{" "}
              <span className="font-medium">{booking.customer.name}</span>
            </span>
          ) : null /* sliver: the accent bar is the whole of it */}
        </span>
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
