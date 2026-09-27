/**
 * The interface language inside client components.
 *
 * No directive: this module holds two context objects and their hooks, and
 * CLAUDE.md keeps anything but components out of a `"use client"` file's
 * exports. It is only ever imported by client components — createContext would
 * fail if a server component pulled it in, which is the right failure.
 *
 * The providers pass down only the locale and vertical strings. Every
 * dictionary is bundled into the client with translate.ts, so no dictionary is
 * serialized across the server→client boundary on every render.
 */
import { createContext, useContext, useMemo } from "react";

import { DEFAULT_LOCALE, type Locale } from "@/lib/preferences";
import type { Vertical } from "@/lib/vertical";

import { createTranslator, type Translator } from "./translate";

export const LocaleContext = createContext<Locale>(DEFAULT_LOCALE);

/**
 * The tenant's vertical. Null outside a tenant — login, and anything rendered
 * above the dashboard layout or the public shop layout, which are the two
 * places that provide it.
 */
export const VerticalContext = createContext<Vertical | null>(null);

export function useLocale(): Locale {
  return useContext(LocaleContext);
}

export function useT(): Translator {
  const locale = useLocale();
  const vertical = useContext(VerticalContext);
  return useMemo(
    () => createTranslator(locale, vertical ?? undefined),
    [locale, vertical],
  );
}
