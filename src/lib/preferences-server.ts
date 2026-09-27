import { cookies } from "next/headers";
import { cache } from "react";

import {
  LOCALE_COOKIE,
  THEME_COOKIE,
  parseLocale,
  parseTheme,
  type Locale,
  type Theme,
} from "./preferences";

/**
 * The request's interface language, from its cookie.
 *
 * Memoized per request: the root layout, every page, and generateMetadata all
 * ask, and the answer cannot change mid-render.
 *
 * Read by public routes as well as the dashboard. That does not blur the two
 * tenant-resolution paths CLAUDE.md keeps apart — this is a display
 * preference, and identifies nobody.
 */
export const getLocale = cache(async (): Promise<Locale> => {
  const store = await cookies();
  return parseLocale(store.get(LOCALE_COOKIE)?.value);
});

export const getTheme = cache(async (): Promise<Theme> => {
  const store = await cookies();
  return parseTheme(store.get(THEME_COOKIE)?.value);
});
