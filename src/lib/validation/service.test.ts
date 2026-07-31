import { describe, expect, it } from "vitest";

import { parsePriceToMinorUnits, serviceInputSchema } from "./service";

/** The shape the form posts, so each test states only what it's varying. */
function input(overrides: Record<string, unknown> = {}) {
  return {
    name: "Haircut",
    durationMinutes: "30",
    priceMinorUnits: "25",
    category: "Hair",
    ...overrides,
  };
}

describe("parsePriceToMinorUnits", () => {
  it("accepts both decimal marks, because the field shows one and keyboards have the other", () => {
    // formatPrice renders de-DE, so an owner correcting a price types the comma
    // they were just shown — while the numeric keypad gives them a dot.
    expect(parsePriceToMinorUnits("25,50")).toBe(2550);
    expect(parsePriceToMinorUnits("25.50")).toBe(2550);
  });

  it("reads a bare integer as whole euros", () => {
    expect(parsePriceToMinorUnits("25")).toBe(2500);
    expect(parsePriceToMinorUnits("0")).toBe(0);
  });

  it("pads a single decimal digit to cents rather than reading it as cents", () => {
    // The one that quietly costs a shop 24,45 € per haircut if it's wrong.
    expect(parsePriceToMinorUnits("25,5")).toBe(2550);
    expect(parsePriceToMinorUnits("25,5")).not.toBe(2505);
  });

  it("tolerates surrounding whitespace", () => {
    expect(parsePriceToMinorUnits("  25,50  ")).toBe(2550);
  });

  it("rejects anything that isn't a price rather than guessing", () => {
    for (const value of [
      "",
      "   ",
      "abc",
      "25,005", // three decimals — a typo, and rounding writes a price nobody chose
      "1.250", // thousands separator, ambiguous across the two locales
      "25,50,50",
      "-25",
      "25 €",
      "2,5e3",
    ]) {
      expect(parsePriceToMinorUnits(value)).toBeNull();
    }
  });
});

describe("serviceInputSchema", () => {
  it("accepts a plain service and converts the price to cents", () => {
    const parsed = serviceInputSchema.parse(input());

    expect(parsed).toEqual({
      name: "Haircut",
      durationMinutes: 30,
      priceMinorUnits: 2500,
      category: "Hair",
    });
  });

  it("accepts a duration that isn't a multiple of the slot step", () => {
    // The demo shop's 20-minute beard trim. Slot starts advance on a fixed
    // 15-minute grid regardless of service length, so this is valid.
    expect(serviceInputSchema.parse(input({ durationMinutes: "20" }))).toMatchObject({
      durationMinutes: 20,
    });
  });

  it("turns an untouched category into undefined, not an empty string", () => {
    // The column is nullable, and "" would sort as its own group on the public
    // page — a heading with no name above one service.
    expect(serviceInputSchema.parse(input({ category: "" })).category).toBeUndefined();
    expect(serviceInputSchema.parse(input({ category: "   " })).category).toBeUndefined();
  });

  it("trims a name but rejects one that isn't a single line", () => {
    expect(serviceInputSchema.parse(input({ name: "  Haircut  " })).name).toBe(
      "Haircut",
    );
    expect(serviceInputSchema.safeParse(input({ name: "Hair\ncut" })).success).toBe(
      false,
    );
  });

  it("rejects a duration outside the workable range", () => {
    for (const durationMinutes of ["0", "4", "481", "-30", "30.5", "abc", ""]) {
      expect(serviceInputSchema.safeParse(input({ durationMinutes })).success).toBe(
        false,
      );
    }
  });

  it("rejects a price that isn't one, and one high enough to be a decimal slip", () => {
    for (const priceMinorUnits of ["", "abc", "25,005", "-5", "9999999"]) {
      expect(serviceInputSchema.safeParse(input({ priceMinorUnits })).success).toBe(
        false,
      );
    }
  });

  it("accepts a free service", () => {
    // Not a hypothetical: a shop running a first-visit promotion prices it at 0
    // rather than deleting the service.
    expect(
      serviceInputSchema.parse(input({ priceMinorUnits: "0" })).priceMinorUnits,
    ).toBe(0);
  });

  it("rejects a name that is too short or too long", () => {
    expect(serviceInputSchema.safeParse(input({ name: "H" })).success).toBe(false);
    expect(
      serviceInputSchema.safeParse(input({ name: "H".repeat(61) })).success,
    ).toBe(false);
  });
});
