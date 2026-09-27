/**
 * Holds the product palette in globals.css to the contrast rules its header
 * comment states, in both themes. Before this test, those numbers were
 * measured by hand once and then only asserted in comments — which is how a
 * ground can shift and quietly take a text colour below AA with it.
 *
 * Parses the `light-dark(<light>, <dark>)` pairs out of the `@theme` block and
 * computes WCAG 2 contrast ratios directly; nothing is rendered.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

type Theme = "light" | "dark";
type Palette = Record<Theme, Map<string, string>>;

function readPalette(): Palette {
  const css = readFileSync(join(__dirname, "globals.css"), "utf8");

  // The product palette is the plain `@theme {` block. `@theme inline` holds
  // the marketing page's fixed shop colours, which are not themed.
  const start = css.indexOf("@theme {");
  const end = css.indexOf("\n}", start);
  if (start === -1 || end === -1) throw new Error("no @theme block in globals.css");
  const block = css.slice(start, end);

  const palette: Palette = { light: new Map(), dark: new Map() };
  const token = /--color-([a-z-]+):\s*light-dark\((#[0-9a-f]{6}),\s*(#[0-9a-f]{6})\)/gi;
  for (const [, name, light, dark] of block.matchAll(token)) {
    palette.light.set(name, light);
    palette.dark.set(name, dark);
  }
  return palette;
}

/** WCAG 2 relative luminance of a #rrggbb colour. */
function luminance(hex: string): number {
  const channel = (offset: number) => {
    const c = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const palette = readPalette();

function ratio(theme: Theme, fg: string, bg: string): number {
  const fgHex = palette[theme].get(fg);
  const bgHex = palette[theme].get(bg);
  if (!fgHex || !bgHex) throw new Error(`missing token: ${fgHex ? bg : fg}`);
  return contrast(fgHex, bgHex);
}

const TEXT = ["fg", "fg-secondary", "fg-tertiary", "fg-muted", "fg-faint"];
const TEXT_GROUNDS = ["surface", "canvas", "subtle"];
const CONTROL_GROUNDS = ["surface", "canvas"];

describe.each<Theme>(["light", "dark"])("product palette, %s theme", (theme) => {
  it.each(TEXT.flatMap((fg) => TEXT_GROUNDS.map((bg) => [fg, bg])))(
    "%s on %s meets AA (4.5:1)",
    (fg, bg) => {
      expect(ratio(theme, fg, bg)).toBeGreaterThanOrEqual(4.5);
    },
  );

  it.each(CONTROL_GROUNDS)("line-strong on %s meets 3:1 (WCAG 1.4.11)", (bg) => {
    expect(ratio(theme, "line-strong", bg)).toBeGreaterThanOrEqual(3);
  });

  it.each(TEXT_GROUNDS)("fg-faint stays a step below fg-muted on %s", (bg) => {
    expect(ratio(theme, "fg-faint", bg)).toBeLessThan(ratio(theme, "fg-muted", bg));
  });

  it.each(CONTROL_GROUNDS)("line-stronger stays beyond line-strong on %s", (bg) => {
    expect(ratio(theme, "line-stronger", bg)).toBeGreaterThan(
      ratio(theme, "line-strong", bg),
    );
  });
});

describe("dark card separation", () => {
  it("surface lifts off canvas by at least 1.15:1", () => {
    // Not a WCAG rule: a floor so cards can't sink back into the page, as they
    // had at 1.10:1 when both were near-identical zinc.
    expect(ratio("dark", "surface", "canvas")).toBeGreaterThanOrEqual(1.15);
  });
});
