import { describe, expect, it } from "vitest";

import {
  parseTimeToMinutes,
  staffInputSchema,
  workingHoursSchema,
} from "./staff";

/** 09:00–18:00 on the given weekday, the shape the editor posts. */
function shift(dayOfWeek: number, start: number, end: number) {
  return { dayOfWeek, startMinute: start, endMinute: end };
}

describe("parseTimeToMinutes", () => {
  it("reads the value an <input type=\"time\"> produces", () => {
    expect(parseTimeToMinutes("09:00")).toBe(540);
    expect(parseTimeToMinutes("00:00")).toBe(0);
    expect(parseTimeToMinutes("13:45")).toBe(825);
    expect(parseTimeToMinutes("9:05")).toBe(545);
  });

  it("accepts 24:00 as a closing time", () => {
    // slots.ts already resolves this to the start of the next local day, so
    // rejecting it here would make the schema stricter than the slot math.
    expect(parseTimeToMinutes("24:00")).toBe(1440);
  });

  it("rejects anything that isn't a wall-clock time", () => {
    for (const value of ["", "abc", "9", "09:60", "25:00", "24:01", "09:00:00"]) {
      expect(parseTimeToMinutes(value)).toBeNull();
    }
  });
});

describe("workingHoursSchema", () => {
  it("accepts an empty week", () => {
    // How a shop closes a chair without deactivating the person.
    expect(workingHoursSchema.parse([])).toEqual([]);
  });

  it("accepts a split shift on one day", () => {
    const rows = [shift(1, 540, 780), shift(1, 840, 1080)];

    expect(workingHoursSchema.safeParse(rows).success).toBe(true);
  });

  it("accepts touching intervals, because adjacency is not overlap", () => {
    // Half-open ranges everywhere else in this codebase treat 14:00 as free
    // after a window ending at 14:00. This has to agree.
    const rows = [shift(2, 540, 840), shift(2, 840, 1080)];

    expect(workingHoursSchema.safeParse(rows).success).toBe(true);
  });

  it("rejects two intervals on one day that share a minute", () => {
    // The rule this schema exists for: slotsForStaff iterates matching rows
    // independently and concatenates, so an overlap emits the same start time
    // twice — a duplicated button on the public grid.
    const rows = [shift(3, 540, 900), shift(3, 840, 1080)];

    expect(workingHoursSchema.safeParse(rows).success).toBe(false);
  });

  it("does not confuse overlapping intervals on different days", () => {
    const rows = [shift(1, 540, 1080), shift(2, 540, 1080), shift(6, 540, 840)];

    expect(workingHoursSchema.safeParse(rows).success).toBe(true);
  });

  it("catches an overlap regardless of the order rows arrive in", () => {
    const rows = [shift(4, 840, 1080), shift(4, 540, 900)];

    expect(workingHoursSchema.safeParse(rows).success).toBe(false);
  });

  it("rejects an interval that ends before it starts, or at the same minute", () => {
    expect(workingHoursSchema.safeParse([shift(1, 1080, 540)]).success).toBe(false);
    expect(workingHoursSchema.safeParse([shift(1, 540, 540)]).success).toBe(false);
  });

  it("rejects a weekday outside 0..6", () => {
    expect(workingHoursSchema.safeParse([shift(7, 540, 1080)]).success).toBe(false);
    expect(workingHoursSchema.safeParse([shift(-1, 540, 1080)]).success).toBe(false);
  });
});

describe("staffInputSchema", () => {
  it("accepts a name alone", () => {
    expect(staffInputSchema.parse({ name: "Marco Rossi" })).toEqual({
      name: "Marco Rossi",
      photoUrl: undefined,
    });
  });

  it("turns an untouched photo field into undefined", () => {
    expect(
      staffInputSchema.parse({ name: "Marco Rossi", photoUrl: "" }).photoUrl,
    ).toBeUndefined();
  });

  it("accepts an https link", () => {
    expect(
      staffInputSchema.parse({
        name: "Marco Rossi",
        photoUrl: "https://example.test/marco.jpg",
      }).photoUrl,
    ).toBe("https://example.test/marco.jpg");
  });

  it("rejects a scheme that isn't http(s)", () => {
    // This value goes straight into an <img src> on the public page, and z.url()
    // alone would accept both of these.
    for (const photoUrl of [
      "javascript:alert(1)",
      "data:image/png;base64,iVBORw0KGgo=",
      "not a url",
    ]) {
      expect(
        staffInputSchema.safeParse({ name: "Marco Rossi", photoUrl }).success,
      ).toBe(false);
    }
  });

  it("rejects a name that isn't a single line", () => {
    expect(
      staffInputSchema.safeParse({ name: "Marco\nRossi" }).success,
    ).toBe(false);
  });
});
