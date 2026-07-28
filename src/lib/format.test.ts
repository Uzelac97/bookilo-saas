import { describe, expect, it } from "vitest";

import { initials } from "./format";

describe("initials", () => {
  it("takes the first and last name", () => {
    expect(initials("Marco Rossi")).toBe("MR");
  });

  // First and last rather than the first two, so a middle name doesn't produce
  // initials that look like a different person's.
  it("skips middle names", () => {
    expect(initials("Jean Luc Picard")).toBe("JP");
  });

  it("handles a single name", () => {
    expect(initials("Marco")).toBe("M");
  });

  it("uppercases whatever it was given", () => {
    expect(initials("marco rossi")).toBe("MR");
  });

  it("tolerates the whitespace a free-text field collects", () => {
    expect(initials("  Marco   Rossi  ")).toBe("MR");
    expect(initials("")).toBe("");
    expect(initials("   ")).toBe("");
  });

  it("keeps non-Latin names intact", () => {
    // Staff names are typed by the shop owner, not picked from a list.
    expect(initials("Милан Узелац")).toBe("МУ");
    expect(initials("Đorđe Petrović")).toBe("ĐP");
  });

  it("does not split a character in half", () => {
    // `name[0]` on a name outside the basic plane returns one half of a
    // surrogate pair, which renders as a replacement character.
    expect(initials("𝒜lice 𝒞ooper")).toBe("𝒜𝒞");
  });
});
