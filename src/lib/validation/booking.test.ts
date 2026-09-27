import { describe, expect, it } from "vitest";

import { createTranslator, translateMessage } from "@/lib/i18n/translate";

import { customerDetailsSchema } from "./booking";

/**
 * A validation message as an English-speaking user reads it. Schemas return
 * message keys (lib/i18n), so assertions go through the dictionary — which
 * also proves every key a schema can emit actually resolves.
 */
const en = (message: string | false | undefined) =>
  typeof message === "string"
    ? translateMessage(createTranslator("en"), message)
    : message;

/** Parses a name against the schema, with the other fields held valid. */
function parseName(name: string) {
  return customerDetailsSchema.safeParse({
    name,
    phone: "030123456",
    email: "",
  });
}

const SINGLE_LINE_MESSAGE = "Enter your name on a single line.";

// Built from code points, never written as the characters themselves. A raw
// U+2028 in a source file is indistinguishable from a space on screen, so a test
// containing one asserts something nobody reading it can see — and the next
// person to touch the file deletes it by accident. fromCodePoint keeps this file
// pure ASCII and says exactly which character each case is about.
const LINE_SEPARATOR = String.fromCodePoint(0x2028);
const PARAGRAPH_SEPARATOR = String.fromCodePoint(0x2029);
const NUL = String.fromCodePoint(0x0000);
const DEL = String.fromCodePoint(0x007f);

describe("customerDetailsSchema.name", () => {
  it("rejects an embedded line break rather than stripping it", () => {
    // The value that motivated this rule: a paste that brought a second field
    // with it. Rejecting means the customer sees what happened and fixes it;
    // stripping would have the shop calling them by a name they never gave.
    for (const name of [
      "Jonas\nWeber",
      "Jonas\r\nWeber",
      "Jonas\rWeber",
      `Jonas${LINE_SEPARATOR}Weber`,
      `Jonas${PARAGRAPH_SEPARATOR}Weber`,
    ]) {
      const result = parseName(name);

      expect(result.success).toBe(false);
      expect(en(result.success === false && result.error.issues[0]?.message)).toBe(
        SINGLE_LINE_MESSAGE,
      );
    }
  });

  it("rejects other control characters too", () => {
    for (const name of [
      "Jonas\tWeber",
      `Jonas${NUL}Weber`,
      `Jonas${DEL}Weber`,
    ]) {
      expect(parseName(name).success, `accepted ${JSON.stringify(name)}`).toBe(
        false,
      );
    }
  });

  it("still trims surrounding whitespace instead of rejecting it", () => {
    // The opposite case, and the reason trim runs first: nobody means to type
    // trailing whitespace, so it's noise to clean rather than input to refuse.
    const result = parseName("  Jonas Weber \n");

    expect(result.success).toBe(true);
    expect(result.success && result.data.name).toBe("Jonas Weber");
  });

  it("reports the length problem, not the line problem, when both would apply", () => {
    // "\n" alone trims to empty, so the useful message is the one asking for a
    // name at all rather than one about line breaks in a field with nothing in it.
    const result = parseName("\n");

    expect(result.success).toBe(false);
    expect(en(result.success === false && result.error.issues[0]?.message)).toBe(
      "Enter your name.",
    );
  });

  it("accepts the names real customers have", () => {
    // The rule must not catch punctuation, accents or non-Latin scripts — every
    // one of these is an ordinary name, and rejecting one is a customer who
    // cannot book.
    for (const name of [
      "Jonas Weber",
      "Jean-Luc O'Brien",
      "Zoë Müller",
      "Björn Åkesson",
      "李伟",
      "Ana María de la Cruz",
    ]) {
      const result = parseName(name);

      expect(result.success, `rejected ${name}`).toBe(true);
      expect(result.success && result.data.name).toBe(name);
    }
  });
});
