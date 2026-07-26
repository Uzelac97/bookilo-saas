import { describe, expect, it } from "vitest";

import { customerDetailsSchema } from "./booking";
import { normalizePhone, phoneDigitCount } from "./phone";

describe("normalizePhone", () => {
  it("strips the punctuation a customer actually types", () => {
    // Every one of these is the same number written the way different people
    // write it. If any pair disagrees, that person has two customer rows.
    const spellings = [
      "030123456",
      "030 123 456",
      "030/123456",
      "030-123-456",
      "030 (123) 456",
      "030.123.456",
      "  030 123 456  ",
    ];

    for (const spelling of spellings) {
      expect(normalizePhone(spelling)).toBe("030123456");
    }
  });

  it("keeps the leading + that makes a number international", () => {
    expect(normalizePhone("+49 176 1234567")).toBe("+491761234567");
  });

  it("drops the parenthesised trunk 0 from a business-card number", () => {
    // The one form that would otherwise fork a customer silently: "+49 (0)176"
    // and "+49 176" are the same number, and phones hand out the first shape.
    expect(normalizePhone("+49 (0)176 1234567")).toBe("+491761234567");
    expect(normalizePhone("+49(0)176 1234567")).toBe(
      normalizePhone("+49 176 1234567"),
    );
  });

  it("only strips (0) where it can be the trunk prefix", () => {
    // No dialing code in front, so this is not the business-card form and the
    // digits are taken at face value rather than guessed at.
    expect(normalizePhone("(0)176 1234567")).toBe("01761234567");
  });

  it("treats 00 as the international prefix it is", () => {
    expect(normalizePhone("0049 176 1234567")).toBe("+491761234567");
    expect(normalizePhone("00 49 176 1234567")).toBe(
      normalizePhone("+49 176 1234567"),
    );
  });

  it("does not mistake a national trunk 0 for an international prefix", () => {
    // One leading zero is a normal German national number. Only a *pair* means
    // "dialing out of the country", so this must stay a plain digit string.
    expect(normalizePhone("0176 1234567")).toBe("01761234567");
  });

  it("leaves the documented ambiguity alone", () => {
    // The known limit spelled out in phone.ts: same human number, two rows.
    // Asserted rather than merely commented, so that if someone later adds a
    // country column and unifies these, this test is what tells them the
    // duplicate-customer caveat in the docs is now stale.
    expect(normalizePhone("0176 1234567")).not.toBe(
      normalizePhone("+49 176 1234567"),
    );
  });

  it("is idempotent — normalising an already-normal number changes nothing", () => {
    // Matters because the stored value gets re-normalised on the rate-limiting
    // path; a second pass that shifted the string would miss its own rows.
    for (const raw of ["030 123 456", "+49 176 1234567", "0049 176 123"]) {
      const once = normalizePhone(raw);
      expect(normalizePhone(once)).toBe(once);
    }
  });
});

describe("phoneDigitCount", () => {
  it("counts digits, not characters", () => {
    expect(phoneDigitCount("030123456")).toBe(9);
    expect(phoneDigitCount("+491761234567")).toBe(12);
  });
});

describe("customerDetailsSchema.phone", () => {
  const parse = (phone: string) =>
    customerDetailsSchema.safeParse({ name: "Jonas Weber", phone, email: "" });

  it("stores the normalised form, not what was typed", () => {
    const result = parse("030 / 123-456");

    expect(result.success).toBe(true);
    expect(result.success && result.data.phone).toBe("030123456");
  });

  it("rejects punctuation dressed up as a long-enough number", () => {
    // Clears the six-*character* minimum with two digits in it. This is the
    // case the digit-count refine exists for.
    const result = parse("12 () - .");

    expect(result.success).toBe(false);
    expect(result.success === false && result.error.issues[0]?.message).toBe(
      "Enter a phone number so the shop can reach you.",
    );
  });

  it("still asks for a number rather than complaining about format when empty", () => {
    const result = parse("");

    expect(result.success).toBe(false);
    expect(result.success === false && result.error.issues[0]?.message).toBe(
      "Enter a phone number so the shop can reach you.",
    );
  });

  it("rejects letters and other shapes that are not a phone number", () => {
    for (const raw of ["call me maybe", "+49 176 abc4567", "030#123456"]) {
      expect(parse(raw).success).toBe(false);
    }
  });

  it("accepts the shapes real customers type", () => {
    for (const raw of [
      "+49 30 1234567",
      "030/1234567",
      "0176-1234567",
      "0049 176 1234567",
    ]) {
      expect(parse(raw).success).toBe(true);
    }
  });
});
