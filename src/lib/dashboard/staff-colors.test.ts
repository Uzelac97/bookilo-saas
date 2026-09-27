import { describe, expect, it } from "vitest";

import type { CalendarStaff } from "@/lib/db/staff";

import { STAFF_COLORS, staffColor, staffColorMap } from "./staff-colors";

function staff(id: string, active = true): CalendarStaff {
  return { id, name: id, active };
}

describe("staffColorMap", () => {
  it("gives each barber a different accent", () => {
    const colors = staffColorMap([staff("a"), staff("b"), staff("c")]);

    expect(new Set(Object.values(colors)).size).toBe(3);
  });

  it("assigns by position, so the same shop always looks the same", () => {
    const colors = staffColorMap([staff("a"), staff("b")]);

    expect(colors.a).toBe(STAFF_COLORS[0]);
    expect(colors.b).toBe(STAFF_COLORS[1]);
  });

  // The reason this takes getStaffForCalendar's list rather than getActiveStaff's.
  // Deactivating a barber is the ordinary case — there is no hard delete — and if
  // retired rows were filtered out before indexing, everyone hired after them
  // would silently change colour on the day someone left.
  it("keeps everyone's colour when a barber is deactivated", () => {
    const before = staffColorMap([staff("a"), staff("b"), staff("c")]);
    const after = staffColorMap([staff("a"), staff("b", false), staff("c")]);

    expect(after).toEqual(before);
  });

  it("wraps once a shop has more barbers than the palette", () => {
    const many = Array.from({ length: STAFF_COLORS.length + 1 }, (_, i) =>
      staff(`s${i}`),
    );
    const colors = staffColorMap(many);

    expect(colors[`s${STAFF_COLORS.length}`]).toBe(colors.s0);
  });

  it("excludes the hues the status treatment already owns", () => {
    // emerald is COMPLETED and amber is NO_SHOW in calendar-grid.tsx. A barber
    // sharing either would undo the separation the accent exists to keep.
    for (const color of STAFF_COLORS) {
      expect(color).not.toMatch(/emerald|amber|orange|yellow/);
    }
  });

  it("returns nothing for a shop with no barbers", () => {
    expect(staffColorMap([])).toEqual({});
  });
});

describe("staffColor", () => {
  it("looks up a known barber", () => {
    const colors = staffColorMap([staff("a")]);

    expect(staffColor(colors, "a")).toBe(STAFF_COLORS[0]);
  });

  it("falls back to a neutral for an unknown barber", () => {
    // buildDayGrid renders a column for a booking whose barber is missing from
    // the staff list rather than dropping the appointment, so this is reachable.
    expect(staffColor({}, "nobody")).toBe("bg-fill");
  });
});
