/**
 * The interface language inside client components.
 *
 * No directive: this module holds a context object and two hooks, and CLAUDE.md
 * keeps anything but components out of a `"use client"` file's exports. It is
 * only ever imported by client components — createContext would fail if a
 * server component pulled it in, which is the right failure.
 *
 * The provider passes down only the locale string. Both dictionaries are
 * bundled into the client with translate.ts, so no dictionary is serialized
 * across the server→client boundary on every render.
 */
import { createContext, useContext, useMemo } from "react";

import { DEFAULT_LOCALE, type Locale } from "@/lib/preferences";

import { createTranslator, type Translator } from "./translate";

export const LocaleContext = createContext<Locale>(DEFAULT_LOCALE);

export function useLocale(): Locale {
  return useContext(LocaleContext);
}

export function useT(): Translator {
  const locale = useLocale();
  return useMemo(() => createTranslator(locale), [locale]);
}
