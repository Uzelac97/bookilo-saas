/**
 * The two per-browser display preferences: interface language and theme.
 *
 * A plain module with no directive, on purpose. Server components, the server
 * actions that write the cookies, and the client toggles all import these
 * constants, and a constant exported from a `"use client"` or `"use server"`
 * file arrives on the other side as a reference proxy rather than the value
 * (CLAUDE.md).
 *
 * BROWSER PREFERENCES, NOT ACCOUNT OR TENANT SETTINGS. They live in cookies so
 * the server renders the right language and theme on the first byte, with no
 * flash and no inline script. They are not stored per user or per tenant:
 * that would be a schema change, and per-tenant language is explicitly out of
 * scope (EXECUTION-PLAN.md, Phase 15a).
 */

export const LOCALES = ["de", "en"] as const;
export type Locale = (typeof LOCALES)[number];

/** The product is demoed and sold in Germany; English is the toggle. */
export const DEFAULT_LOCALE: Locale = "de";

/**
 * "system" is the absence of a choice — no `data-theme` on <html>, so
 * `color-scheme: light dark` in globals.css hands the decision to the OS.
 */
export const THEMES = ["system", "light", "dark"] as const;
export type Theme = (typeof THEMES)[number];

export const DEFAULT_THEME: Theme = "system";

export const LOCALE_COOKIE = "locale";
export const THEME_COOKIE = "theme";

/** A year. A display preference should outlive a session, not a device. */
export const PREFERENCE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/**
 * A cookie value, or anything else, as a supported locale. The cookie is
 * client-writable, so an unknown value is a normal input, not an error.
 */
export function parseLocale(value: string | undefined): Locale {
  return LOCALES.find((locale) => locale === value) ?? DEFAULT_LOCALE;
}

export function parseTheme(value: string | undefined): Theme {
  return THEMES.find((theme) => theme === value) ?? DEFAULT_THEME;
}
