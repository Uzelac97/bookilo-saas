import { describe, expect, it } from "vitest";

import { MAX_DURATION_MINUTES } from "./validation/service";

import { formatCancellationDeadline, formatDuration, initials } from "./format";

describe("formatDuration", () => {
  it("keeps the shapes every existing caller depends on", () => {
    expect(formatDuration(5)).toBe("5 min");
    expect(formatDuration(30)).toBe("30 min");
    expect(formatDuration(59)).toBe("59 min");
    expect(formatDuration(60)).toBe("1 h");
    expect(formatDuration(75)).toBe("1 h 15 min");
    expect(formatDuration(120)).toBe("2 h");
  });

  it("switches to days at exactly a day, and not a minute before", () => {
    // The boundary the days tier was added for. 1439 has to stay in hours or a
    // service length near the ceiling could change shape unexpectedly.
    expect(formatDuration(1439)).toBe("23 h 59 min");
    expect(formatDuration(1440)).toBe("1 day");
    expect(formatDuration(1441)).toBe("1 day 1 min");
  });

  it("pluralises days but not the unit symbols", () => {
    expect(formatDuration(1440)).toBe("1 day");
    expect(formatDuration(2880)).toBe("2 days");
    // The settings ceiling for the cancellation window, and the value that used
    // to render "168 h" at customers.
    expect(formatDuration(10080)).toBe("7 days");
  });

  it("never rounds a part away", () => {
    // A window an owner set is a promise made to a customer; the two must not
    // disagree by a minute.
    expect(formatDuration(1500)).toBe("1 day 1 h");
    expect(formatDuration(1501)).toBe("1 day 1 h 1 min");
    expect(formatDuration(4321)).toBe("3 days 1 min");
  });

  it("renders zero rather than an empty string", () => {
    // Reachable only from a cancellation window of 0. Every caller that can pass
    // one goes through formatCancellationDeadline instead, which words it
    // properly — this is the fallback for a future caller that doesn't.
    expect(formatDuration(0)).toBe("0 min");
  });

  it("cannot produce a days tier for any valid service length", () => {
    // The claim in formatDuration's doc comment, asserted against the real
    // schema ceiling rather than a copy of it. If MAX_DURATION_MINUTES is ever
    // raised past a day, this fails and the comment stops being a lie.
    expect(MAX_DURATION_MINUTES).toBeLessThan(1440);

    for (let minutes = 1; minutes <= MAX_DURATION_MINUTES; minutes += 1) {
      expect(formatDuration(minutes)).not.toContain("day");
    }
  });
});

describe("formatCancellationDeadline", () => {
  it("gives a window of zero its own wording", () => {
    // THE POINT OF THE FUNCTION. Composing formatDuration(0) into the sentence
    // produced "You can cancel online up to 0 min before your appointment",
    // which reads as a deadline so tight there is effectively no cancelling —
    // the exact opposite of what the setting means.
    expect(formatCancellationDeadline(0)).toBe("any time before");
    expect(formatCancellationDeadline(0)).not.toContain("0 min");
    expect(formatCancellationDeadline(0)).not.toContain("up to");
  });

  it("quotes the window as a deadline everywhere else", () => {
    expect(formatCancellationDeadline(120)).toBe("up to 2 h before");
    expect(formatCancellationDeadline(1440)).toBe("up to 1 day before");
    expect(formatCancellationDeadline(10080)).toBe("up to 7 days before");
  });

  it("reads as a sentence in the frame all three surfaces use", () => {
    // The surfaces interpolate this into "You can cancel online ___ your
    // appointment." Asserted here so a future edit can't produce a phrase that
    // is correct alone and ungrammatical in place.
    const sentence = (minutes: number) =>
      `You can cancel online ${formatCancellationDeadline(minutes)} your appointment.`;

    expect(sentence(0)).toBe(
      "You can cancel online any time before your appointment.",
    );
    expect(sentence(10080)).toBe(
      "You can cancel online up to 7 days before your appointment.",
    );
  });
});

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
