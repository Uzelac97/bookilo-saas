/**
 * Guards for the light/dark theme, which lives in globals.css as `light-dark()`
 * tokens. Both failures below are invisible in the default light theme: nothing
 * looks wrong until someone switches to dark, so a test is the only reviewer
 * that checks every file every time.
 *
 * Reads source text rather than rendering. That's enough here, because both
 * rules concern which class names a file writes, not what the page computes.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { describe, expect, it } from "vitest";

const SRC = join(__dirname, "..");

/**
 * The Kastanien marketing page is shop content with its own fixed `shop-*`
 * palette, dark in both themes on purpose (see globals.css). It is not the
 * product's UI and is not themed.
 */
function isExempt(path: string): boolean {
  return path.split(sep).includes("(marketing)") || path.split(sep).includes("marketing");
}

function sourceFiles(): { path: string; text: string }[] {
  // readdirSync's `recursive` rather than globSync: globSync from node:fs is
  // not in this project's @types/node, and fails typecheck (CLAUDE.md).
  return readdirSync(SRC, { recursive: true, encoding: "utf8" })
    .filter((file) => /\.(tsx|ts)$/.test(file) && !file.endsWith(".test.ts"))
    .filter((file) => !isExempt(file))
    .map((file) => ({
      path: file,
      text: readFileSync(join(SRC, file), "utf8"),
    }));
}

describe("theme tokens", () => {
  it("no product UI names a raw colour shade instead of a theme token", () => {
    // A raw shade is fixed in both themes: text-zinc-900 is near-black on a
    // dark page too. The staff accents are fixed as well, but they are named
    // palette tokens (`--color-staff-*` in globals.css) whose contrast
    // theme-contrast.test.ts checks, so they never reach this pattern.
    const RAW =
      /\b(?:bg|text|border|ring|divide|outline|fill|stroke|placeholder)-(?:white|black|zinc|gray|slate|neutral|stone|red|amber|emerald)(?:-\d{2,3})?\b/g;

    const offenders = sourceFiles().flatMap(({ path, text }) =>
      [...text.matchAll(RAW)].map((match) => `${relative(SRC, join(SRC, path))}: ${match[0]}`),
    );

    expect(offenders).toEqual([]);
  });

  it("every visible form control states both its background and text colour", () => {
    // Tailwind v4's preflight gives form controls `color: inherit;
    // background-color: #0000`. A control naming neither colour inherits body
    // text over whatever surface sits behind it — the white-on-white regression
    // recorded in globals.css and components/ui/field.tsx.
    // .tsx only: a .ts file has no JSX, and its comments quote tags as prose.
    const controls = sourceFiles()
      .filter(({ path }) => path.endsWith(".tsx"))
      .flatMap(({ path, text }) => formControlTags(text).map((tag) => ({ path, tag })));

    const offenders = controls
      // Hidden inputs render nothing. Checkboxes and radios are painted by the
      // UA from color-scheme, not from background/colour, so the preflight
      // reset doesn't blank them.
      .filter(({ tag }) => !/type="(hidden|checkbox|radio)"/.test(tag))
      .filter(
        ({ tag }) =>
          !/\bbg-[a-z]/.test(tag) || !/\btext-(?!(?:xs|sm|base|lg|xl|\d)\b)[a-z]/.test(tag),
      )
      .map(({ path, tag }) => `${path}: ${tag.slice(0, 60)}`);

    // Sanity floor, so a scanner bug that finds nothing can't pass as "clean".
    expect(controls.length).toBeGreaterThan(20);
    expect(offenders).toEqual([]);
  });
});

/**
 * Every <input>, <select> and <textarea> opening tag in a file, whole.
 *
 * A regex can't do this: an attribute like `onChange={(e) => …}` contains a `>`
 * that ends a naive `[^>]*` match mid-tag, which is how an earlier version of
 * this test silently skipped 28 of 32 controls. So it walks the text, tracking
 * brace depth, strings, and comments, and stops at the first `>` outside all
 * of them.
 */
function formControlTags(text: string): string[] {
  const tags: string[] = [];
  const opener = /<(?:input|select|textarea)\b/g;

  for (const match of text.matchAll(opener)) {
    let i = match.index + match[0].length;
    let depth = 0;
    let quote: string | null = null;

    for (; i < text.length; i++) {
      const char = text[i];
      if (quote) {
        if (char === quote) quote = null;
        continue;
      }
      if (text.startsWith("//", i)) {
        i = text.indexOf("\n", i);
        continue;
      }
      if (text.startsWith("/*", i)) {
        i = text.indexOf("*/", i) + 1;
        continue;
      }
      if (char === '"' || char === "'" || char === "`") quote = char;
      else if (char === "{") depth++;
      else if (char === "}") depth--;
      else if (char === ">" && depth === 0) break;
    }

    tags.push(text.slice(match.index, i + 1));
  }

  return tags;
}
