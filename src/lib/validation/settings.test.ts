import { describe, expect, it } from "vitest";

import { bookingRulesSchema } from "./settings";

/** The shape the settings form posts, so each test states only what it varies. */
function input(overrides: Record<string, unknown> = {}) {
  return {
    bufferMinutes: "10",
    minLeadMinutes: "60",
    cancellationWindowMinutes: "120",
    ...overrides,
  };
}

/** The first message Zod reports for one field, or undefined if it passed. */
function errorFor(
  field: keyof ReturnType<typeof input>,
  value: unknown,
): string | undefined {
  const parsed = bookingRulesSchema.safeParse(input({ [field]: value }));
  if (parsed.success) return undefined;

  return parsed.error.issues.find((issue) => issue.path[0] === field)?.message;
}

describe("bookingRulesSchema", () => {
  it("parses the three fields into whole minutes", () => {
    expect(bookingRulesSchema.parse(input())).toEqual({
      bufferMinutes: 10,
      minLeadMinutes: 60,
      cancellationWindowMinutes: 120,
    });
  });

  it("accepts zero for all three, because each zero is a real policy", () => {
    // No gap between appointments (the case the Day 3 exclusion-constraint probe
    // asserts stays bookable), same-day online booking, and "cancel any time".
    expect(
      bookingRulesSchema.parse(
        input({
          bufferMinutes: "0",
          minLeadMinutes: "0",
          cancellationWindowMinutes: "0",
        }),
      ),
    ).toEqual({
      bufferMinutes: 0,
      minLeadMinutes: 0,
      cancellationWindowMinutes: 0,
    });
  });

  it("tolerates surrounding whitespace", () => {
    expect(bookingRulesSchema.parse(input({ bufferMinutes: "  15  " }))).toEqual(
      expect.objectContaining({ bufferMinutes: 15 }),
    );
  });

  it("rejects an empty field rather than reading it as zero", () => {
    // The reason this schema parses explicitly instead of using z.coerce: 0 is a
    // valid setting here, so an empty box saved as 0 would look deliberate — the
    // owner would have silently turned off their own notice period.
    expect(errorFor("minLeadMinutes", "")).toBe(
      "Enter a notice period, or 0 for none.",
    );
    expect(errorFor("minLeadMinutes", "   ")).toBe(
      "Enter a notice period, or 0 for none.",
    );
  });

  it("rejects anything that isn't whole minutes", () => {
    for (const value of ["abc", "10.5", "10,5", "1e3", "10 min", "+10"]) {
      expect(errorFor("bufferMinutes", value)).toBeDefined();
    }
  });

  it("rejects a negative through the same pattern that rejects letters", () => {
    // There is no separate floor check: `\d+` cannot match a minus sign, so "-5"
    // takes the identical path as "abc" and lands on the whole-minutes message.
    // Asserted so that stays true — a future `z.coerce` would read "-5" as -5 and
    // pass it straight through to a column that has no CHECK constraint.
    expect(errorFor("bufferMinutes", "-5")).toBe(
      "Enter the gap in whole minutes.",
    );
    expect(errorFor("bufferMinutes", "-5")).toBe(errorFor("bufferMinutes", "abc"));
  });

  it("caps the buffer at an hour", () => {
    expect(
      bookingRulesSchema.safeParse(input({ bufferMinutes: "60" })).success,
    ).toBe(true);
    expect(errorFor("bufferMinutes", "61")).toBe(
      "Keep the gap between 0 and 60 minutes.",
    );
  });

  it("caps the notice period below the booking horizon", () => {
    // A lead time past the horizon leaves nothing bookable at all: every day the
    // date strip offers would be inside the notice period, so the public page
    // would show a month of empty days with no explanation.
    expect(
      bookingRulesSchema.safeParse(input({ minLeadMinutes: "10080" })).success,
    ).toBe(true);
    expect(errorFor("minLeadMinutes", "10081")).toContain("30 days ahead");
  });

  it("caps the cancellation window at a week", () => {
    expect(
      bookingRulesSchema.safeParse(input({ cancellationWindowMinutes: "10080" }))
        .success,
    ).toBe(true);
    expect(errorFor("cancellationWindowMinutes", "10081")).toBeDefined();
  });

  it("reports each bad field separately, so the form can mark all of them", () => {
    const parsed = bookingRulesSchema.safeParse({
      bufferMinutes: "999",
      minLeadMinutes: "abc",
      cancellationWindowMinutes: "",
    });

    expect(parsed.success).toBe(false);
    if (parsed.success) return;

    expect(new Set(parsed.error.issues.map((issue) => issue.path[0]))).toEqual(
      new Set(["bufferMinutes", "minLeadMinutes", "cancellationWindowMinutes"]),
    );
  });
});
