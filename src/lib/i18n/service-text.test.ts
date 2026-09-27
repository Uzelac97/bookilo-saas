import { describe, expect, it } from "vitest";

import { categoryLabel, groupCategoryEn, serviceName } from "./service-text";

describe("serviceName", () => {
  const haircut = { name: "Haarschnitt", nameEn: "Haircut" };

  it("shows the English name in English and the German one in German", () => {
    expect(serviceName(haircut, "en")).toBe("Haircut");
    expect(serviceName(haircut, "de")).toBe("Haarschnitt");
  });

  it("falls back to the German name when there is no English one", () => {
    // Null is how an untranslated service arrives from the database, and "" is
    // a value that must never reach a customer as a blank service name.
    expect(serviceName({ name: "Glossing", nameEn: null }, "en")).toBe("Glossing");
    expect(serviceName({ name: "Glossing", nameEn: "" }, "en")).toBe("Glossing");
    expect(serviceName({ name: "Glossing" }, "en")).toBe("Glossing");
  });
});

describe("categoryLabel", () => {
  it("translates a category, and falls back to it untranslated", () => {
    expect(categoryLabel({ category: "Damen", categoryEn: "Women" }, "en")).toBe("Women");
    expect(categoryLabel({ category: "Damen", categoryEn: "Women" }, "de")).toBe("Damen");
    expect(categoryLabel({ category: "Damen", categoryEn: null }, "en")).toBe("Damen");
  });

  it("leaves 'no category' to the caller", () => {
    expect(categoryLabel({ category: null, categoryEn: "Other" }, "en")).toBeNull();
  });
});

describe("groupCategoryEn", () => {
  it("takes the first English label set anywhere in the group", () => {
    expect(
      groupCategoryEn([{ categoryEn: null }, { categoryEn: "Women" }, { categoryEn: "Ladies" }]),
    ).toBe("Women");
  });

  it("is null when nobody in the group has one", () => {
    expect(groupCategoryEn([{ categoryEn: null }, {}])).toBeNull();
  });
});
