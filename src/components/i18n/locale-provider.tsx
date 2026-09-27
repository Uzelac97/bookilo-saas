"use client";

import { LocaleContext } from "@/lib/i18n/client";
import type { Locale } from "@/lib/preferences";

/**
 * Hands the request's locale, resolved from its cookie by the root layout, to
 * every client component below it. The component is the only export here —
 * the context and hooks live in lib/i18n/client.ts (see the note there).
 */
export function LocaleProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: React.ReactNode;
}) {
  return <LocaleContext value={locale}>{children}</LocaleContext>;
}
