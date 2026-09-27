import { describe, expect, it } from "vitest";

import { de } from "./messages/de";
import { en } from "./messages/en";
import { salonDe } from "./messages/salon.de";
import { salonEn } from "./messages/salon.en";
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

describe("the salon overlay", () => {
  const keys = Object.keys(de) as MessageKey[];
  const placeholders = (text: string) =>
    [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
  const overlays = [
    { locale: "de", base: de, overlay: salonDe as Partial<Record<MessageKey, string>> },
    { locale: "en", base: en, overlay: salonEn as Partial<Record<MessageKey, string>> },
  ] as const;

  /**
   * Keys that still say barber or shop in a salon's translator, each because
   * it never renders for a tenant at all — so there is no vertical to speak
   * in. Anything else matching the pattern below is a message that was added
   * with barbershop wording and no salon version.
   */
  const TENANTLESS_KEYS: Partial<Record<MessageKey, string>> = {
    "meta.description": "the product's own description, on the root layout",
    "shop.notFoundTitle": "the 404 for a slug that resolves to no tenant",
    "shop.notFoundBody": "the 404 for a slug that resolves to no tenant",
    "shop.businessTypeBarbershop": "the barbershop's label, looked up by vertical",
  };

  it.each(overlays)(
    "keeps the placeholders of each message it replaces ($locale)",
    ({ base, overlay }) => {
      // A salon message that dropped {phone} would render the sentence without
      // the number in it, and nothing else would notice.
      const mismatched = (Object.keys(overlay) as MessageKey[]).filter(
        (key) =>
          placeholders(overlay[key] ?? "").join() !== placeholders(base[key]).join(),
      );

      expect(mismatched).toEqual([]);
    },
  );

  it.each(overlays)(
    "only overrides with something different ($locale)",
    ({ base, overlay }) => {
      const redundant = (Object.keys(overlay) as MessageKey[]).filter(
        (key) => overlay[key] === base[key],
      );

      expect(redundant).toEqual([]);
    },
  );

  it.each(["de", "en"] as const)(
    "leaves no barbershop wording in a salon's messages (%s)",
    (locale) => {
      const t = createTranslator(locale, "SALON");
      // Placeholders are stripped first: {shop} is the tenant's own name and
      // {barber} the staff member's, so neither is wording.
      const visible = (key: MessageKey) => t(key).replace(/\{\w+\}/g, "");
      const leftover = keys.filter(
        (key) =>
          !(key in TENANTLESS_KEYS) && /barber|\bshops?\b/i.test(visible(key)),
      );

      expect(leftover).toEqual([]);
    },
  );

  it("leaves the barbershop's messages exactly as the base dictionaries", () => {
    for (const { locale, base } of overlays) {
      const t = createTranslator(locale, "BARBERSHOP");
      const changed = keys.filter((key) => t(key) !== base[key]);

      expect(changed).toEqual([]);
    }
  });

  it("defaults to the base wording when no vertical is given", () => {
    expect(createTranslator("en")("book.preferredBarber")).toBe(
      "Preferred barber",
    );
  });

  it("switches wording by vertical, and still fills placeholders", () => {
    const salon = createTranslator("de", "SALON");

    expect(salon("book.preferredBarber")).toBe("Wunsch-Stylist:in");
    expect(salon("cancel.closedNoticePhone", { phone: "0711 123" })).toContain(
      "ruf bitte im Salon an: 0711 123",
    );
    expect(createTranslator("de", "BARBERSHOP")("book.preferredBarber")).toBe(
      "Wunsch-Barber",
    );
  });

  it("resolves plurals through the overlay", () => {
    // No plural is overridden today; this pins that the merged dictionary
    // still carries the base's .one/.other pairs.
    const t = createTranslator("de", "SALON");

    expect(t("calendar.appointmentCount", { count: 1 })).toBe("1 Termin");
    expect(t("calendar.appointmentCount", { count: 2 })).toBe("2 Termine");
  });
});
