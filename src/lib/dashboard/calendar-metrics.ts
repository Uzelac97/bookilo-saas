/**
 * The calendar grid's horizontal measurements, and the width they add up to.
 *
 * A plain module, and deliberately not part of components/dashboard/calendar-grid
 * where these used to live. The page calls calendarCardWidth during its *server*
 * render to build the container's clamp(), while the grid is heading for
 * interactivity in Day 11 — click-to-book, marking a booking complete. If that
 * arrives as a click handler, the natural next step is `"use client"` on the
 * component file, and that directive rewrites every export in its file into a
 * client reference: calendarCardWidth would reach the page as a throwing proxy
 * instead of a function, with no type error to warn anyone. CLAUDE.md documents
 * that exact failure having already happened here once, with ANY_STAFF.
 *
 * Keeping the lengths here means the directive can land on the component
 * whenever it needs to, and this cannot break. Same reasoning that put ANY_STAFF
 * in lib/availability/booking-options.ts rather than beside its picker.
 *
 * Vertical geometry is a different question and lives with the layout maths in
 * ./calendar-layout.ts — CALENDAR_PX_PER_HOUR sizes an hour, and the density
 * thresholds decide what fits in a block. These are the other axis: how wide the
 * frame is, which no booking-level computation depends on.
 *
 * CSS lengths rather than numbers, because they are rem and px mixed and only
 * the browser knows the root font size.
 */

/** The time gutter down the left, where the hour labels sit. */
export const AXIS_WIDTH = "4rem";

/** Below this a column stops shrinking and the grid scrolls instead. */
export const MIN_COLUMN_WIDTH = "9rem";

/**
 * How wide a column is allowed to get.
 *
 * The columns were once `minmax(0, 1fr)` inside a fixed max-width page, which put
 * the sizing on the wrong end of the problem: the container was constant while
 * the column count swings from two barbers to a seven-day week. At seven that
 * left ~149px a column and looked cramped on a wide monitor; at two it produced
 * 520px columns holding a 27px-tall booking block, which is not "roomy", just
 * empty.
 *
 * Bounding the column instead makes it self-correcting at any staff count.
 */
export const MAX_COLUMN_WIDTH = "16rem";

/**
 * The card's 1px border, left and right.
 *
 * Small and load-bearing: the border sits outside the grid's content box, so a
 * caller sizing a container to `axis + columns` alone lands 2px short, the card
 * hits its own `max-w-full`, and the grid gets a 2px horizontal scrollbar on a
 * layout that is otherwise an exact fit. ./calendar-metrics.test.ts guards it.
 */
const CARD_BORDER = "2px";

/**
 * How wide the calendar card wants to be, given its column count — border
 * included.
 *
 * The page sizes and centres the whole calendar column from this, rather than
 * leaving a wide container with a small card adrift at one end of it.
 */
export function calendarCardWidth(columnCount: number): string {
  return `calc(${AXIS_WIDTH} + ${columnCount} * ${MAX_COLUMN_WIDTH} + ${CARD_BORDER})`;
}
