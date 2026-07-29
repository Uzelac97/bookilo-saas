import { describe, expect, it } from "vitest";

import { calendarCardWidth } from "./calendar-metrics";

/**
 * Resolves the `calc(...)` the component emits, at a 16px root.
 *
 * Deliberately a real evaluator rather than a string comparison: asserting the
 * exact expression would only restate the implementation and would break on a
 * harmless reordering of its terms. What matters is the number it comes to.
 */
function resolvePx(css: string): number {
  // [\s\S] rather than `.` with the `s` flag — that flag needs an es2018 target
  // and this project's is lower, which tsc catches and Vitest's esbuild doesn't.
  const body = css.trim().replace(/^calc\(([\s\S]*)\)$/, "$1");

  return body.split("+").reduce((total, term) => {
    const t = term.trim();
    if (t.endsWith("px")) return total + parseFloat(t);

    if (t.includes("*")) {
      const [count, length] = t.split("*").map((s) => s.trim());
      return total + parseFloat(count) * parseFloat(length) * 16;
    }

    return total + parseFloat(t) * 16;
  }, 0);
}

describe("calendarCardWidth", () => {
  it("emits a resolvable CSS length", () => {
    expect(calendarCardWidth(3)).toMatch(/^calc\(.+\)$/);
    expect(Number.isFinite(resolvePx(calendarCardWidth(3)))).toBe(true);
  });

  // THE REASON THIS FILE EXISTS. The card's 1px borders sit outside the grid's
  // content box, so a width of axis + columns alone lands 2px short: the card
  // hits its own max-w-full, and a layout that is otherwise an exact fit gets a
  // horizontal scrollbar. Every term but the border is a whole number of rem, so
  // a sub-rem remainder is exactly the allowance being present — drop the "+ 2px"
  // and this goes to 0 at every column count.
  it("carries a sub-rem allowance for the card's borders", () => {
    for (const columns of [0, 1, 2, 3, 4, 5, 7, 12]) {
      expect(
        resolvePx(calendarCardWidth(columns)) % 16,
        `${columns} columns: the +2px border allowance is missing, so a container ` +
          `sized from this width will be 2px too narrow for the card and scroll`,
      ).toBe(2);
    }
  });

  it("grows by exactly one column per column", () => {
    const widths = [0, 1, 2, 3, 4, 5, 6, 7].map((n) =>
      resolvePx(calendarCardWidth(n)),
    );
    const steps = widths.slice(1).map((w, i) => w - widths[i]);

    // A single step size at every count is what lets the page cap be computed
    // from the column count rather than guessed per staff count.
    expect(new Set(steps).size, `steps were ${steps.join(", ")}`).toBe(1);
    expect(steps[0]).toBeGreaterThan(0);
  });

  it("is the axis plus the borders when there are no columns", () => {
    // The empty-shop case. It still has to be a real width: the page sizes its
    // container from this before knowing whether the grid renders columns or the
    // empty state.
    const bare = resolvePx(calendarCardWidth(0));

    expect(bare).toBeGreaterThan(0);
    expect(bare).toBeLessThan(resolvePx(calendarCardWidth(1)));
  });
});
