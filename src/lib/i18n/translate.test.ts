import { describe, expect, it } from "vitest";

import { de } from "./messages/de";
import { en } from "./messages/en";
import {
  createTranslator,
  encodeMessage,
  translateMessage,
  type MessageKey,
} from "./translate";

describe("createTranslator", () => {
  it("looks a key up in the chosen language", () => {
    expect(createTranslator("de")("nav.calendar")).toBe("Kalender");
    expect(createTranslator("en")("nav.calendar")).toBe("Calendar");
  });

  it("fills placeholders, and leaves an unfilled one visible", () => {
    const t = createTranslator("en");

    expect(t("booking.backTo", { shop: "Kaiser Barbers" })).toBe(
      "Back to Kaiser Barbers",
    );
    // A missing param is a bug worth seeing on screen, not an empty gap.
    expect(t("booking.backTo")).toBe("Back to {shop}");
  });

  it("picks the plural form from count", () => {
    const t = createTranslator("de");

    expect(t("calendar.appointmentCount", { count: 1 })).toBe("1 Termin");
    expect(t("calendar.appointmentCount", { count: 3 })).toBe("3 Termine");
    // Zero is "other" in both languages: "0 Termine", not "0 Termin".
    expect(t("calendar.appointmentCount", { count: 0 })).toBe("0 Termine");
  });
});

describe("encodeMessage / translateMessage", () => {
  const t = createTranslator("en");

  it("round-trips a key with parameters through one string", () => {
    const packed = encodeMessage("validation.bufferRange", { max: 60 });

    expect(packed).toBe("validation.bufferRange?max=60");
    expect(translateMessage(t, packed)).toBe(
      "Keep the gap between 0 and 60 minutes.",
    );
  });

  it("translates a plain key", () => {
    expect(translateMessage(t, "validation.priceRequired")).toBe(
      "Enter a price.",
    );
  });

  it("passes a string that isn't a key through untouched", () => {
    // A raw library message reaching the screen beats an empty error.
    expect(translateMessage(t, "Invalid input")).toBe("Invalid input");
  });
});

describe("the dictionaries", () => {
  const keys = Object.keys(de) as MessageKey[];
  const placeholders = (text: string) =>
    [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();

  it("use the same placeholders in both languages", () => {
    // tsc guarantees both dictionaries have the same keys, but not that a
    // translation kept its {name}. A dropped placeholder renders as silence.
    const mismatched = keys.filter(
      (key) =>
        placeholders(de[key]).join() !== placeholders(en[key]).join(),
    );

    expect(mismatched).toEqual([]);
  });

  it("define every plural as a complete .one/.other pair", () => {
    const incomplete = keys
      .filter((key) => key.endsWith(".one") || key.endsWith(".other"))
      .map((key) => key.replace(/\.(one|other)$/, ""))
      .filter(
        (base) => !(`${base}.one` in de) || !(`${base}.other` in de),
      );

    expect(incomplete).toEqual([]);
  });

  it("leave no value empty", () => {
    const empty = keys.filter((key) => !de[key].trim() || !en[key].trim());

    expect(empty).toEqual([]);
  });
});
