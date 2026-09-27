/**
 * A stable colour per barber, for identifying a booking's owner at a glance.
 *
 * Needed because the calendar's existing colour already means something else:
 * STATUS_BLOCK_STYLES in components/dashboard/calendar-grid.tsx paints a block
 * by BookingStatus (emerald for done, amber for a no-show), and overloading that
 * with staff identity would cost the status signal. So the barber gets its own
 * channel — an accent bar — and this module decides which colour goes to whom.
 *
 * It earns its place in the week view, where a column is a *day* and the barber
 * is otherwise only discoverable by reading truncated text. In the day view the
 * column header already says it, so there the colour is reinforcement.
 */
import type { CalendarStaff } from "@/lib/db/staff";

/**
 * The accent palette, as background classes rather than border ones.
 *
 * Backgrounds on purpose: the accent renders as its own element inside the
 * block, not as a border. A `border-l-*` colour would be competing with the
 * status treatment's `border-*` for the same longhand property, and which one
 * won would come down to Tailwind's stylesheet ordering rather than anything
 * stated here — the kind of thing that works until a version bump reorders it.
 *
 * Deliberately excludes the emerald and amber families: those are COMPLETED and
 * NO_SHOW, and a barber whose accent is the same hue as a status would undo the
 * separation this module exists to keep.
 *
 * Eight is well past the five chairs this product targets. The wrap below is a
 * backstop, not a plan.
 */
export const STAFF_COLORS = [
  "bg-sky-500",
  "bg-violet-500",
  "bg-rose-500",
  "bg-teal-500",
  "bg-indigo-500",
  "bg-fuchsia-500",
  "bg-lime-600",
  "bg-cyan-600",
] as const;

/**
 * Maps every barber to an accent class, keyed by staff id.
 *
 * The index comes from the caller's ordering, which must be getStaffForCalendar's
 * — `createdAt` ascending over *all* staff, active or not. That the inactive ones
 * are included is what makes this stable: deactivating a barber is the common
 * case (there is no hard delete), and if retired rows were filtered out first,
 * every barber hired after them would shift a colour the day someone left.
 *
 * Hashing the id instead would avoid needing an order at all, and was rejected:
 * five barbers into eight buckets collide better than three quarters of the
 * time, so two of a shop's chairs would routinely share a colour.
 */
export function staffColorMap(staff: CalendarStaff[]): Record<string, string> {
  const colors: Record<string, string> = {};

  staff.forEach((member, index) => {
    colors[member.id] = STAFF_COLORS[index % STAFF_COLORS.length];
  });

  return colors;
}

/**
 * The accent for one barber, falling back to a neutral for an id the map doesn't
 * know.
 *
 * The fallback is not decoration: buildDayGrid deliberately renders a column for
 * a booking whose barber is missing from the staff list rather than dropping the
 * appointment, so this has to answer for that case too.
 */
export function staffColor(
  colors: Record<string, string>,
  staffId: string,
): string {
  return colors[staffId] ?? "bg-fill";
}
