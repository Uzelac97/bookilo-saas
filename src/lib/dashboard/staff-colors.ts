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
 *
 * Two channels from one class: the accent bar at full strength, and a wash over
 * the whole block at STAFF_TINT_ALPHA, so a glance at a crowded week column says
 * whose each block is without finding its 4px edge. The wash is laid over the
 * status ground rather than replacing it, so the status still reads underneath.
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
 * Theme tokens (`--color-staff-*` in app/globals.css) rather than Tailwind's
 * own shades, so src/app/theme-contrast.test.ts can read the exact values and
 * prove the tinted grounds keep the block text at AA.
 *
 * Deliberately excludes the emerald and amber families: those are COMPLETED and
 * NO_SHOW, and a barber whose accent is the same hue as a status would undo the
 * separation this module exists to keep.
 *
 * Eight is well past the five chairs this product targets. The wrap below is a
 * backstop, not a plan.
 */
export const STAFF_COLORS = [
  "bg-staff-sky",
  "bg-staff-violet",
  "bg-staff-rose",
  "bg-staff-teal",
  "bg-staff-indigo",
  "bg-staff-fuchsia",
  "bg-staff-lime",
  "bg-staff-cyan",
] as const;

/**
 * How strongly the barber's colour washes over a block, as a fraction and as
 * the class that applies it. Two forms of one number because Tailwind only
 * generates classes it can see written out whole: the class is for the
 * component, the fraction for theme-contrast.test.ts, and that test asserts
 * the two agree.
 *
 * 14% is enough for the hue to name the barber at a glance and faint enough
 * that the block's text stays AA on every status ground in both themes —
 * which the test checks for every hue, rather than this comment asserting it.
 */
export const STAFF_TINT_ALPHA = 0.14;
export const STAFF_TINT_CLASS = "opacity-14";

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
