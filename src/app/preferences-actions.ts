"use server";

import { cookies } from "next/headers";
import { z } from "zod";

import {
  LOCALES,
  LOCALE_COOKIE,
  PREFERENCE_COOKIE_MAX_AGE,
  THEMES,
  THEME_COOKIE,
} from "@/lib/preferences";

/**
 * Persist the interface language and theme.
 *
 * UNAUTHENTICATED ON PURPOSE: the login page shows both toggles, before there
 * is a session. Neither action reads or writes tenant data — each validates a
 * two- or three-value enum and sets one cookie on the caller's own browser —
 * so there is nothing here for a session to protect.
 *
 * A cookie write inside a server action makes Next re-render the current
 * route, which is what swaps every string to the new language without a
 * reload.
 *
 * Nothing else may be exported from this file: `"use server"` turns every
 * export into an action reference (CLAUDE.md).
 */

const localeSchema = z.enum(LOCALES);
const themeSchema = z.enum(THEMES);

// An unknown value is ignored rather than thrown: the toggles only ever send
// a listed one, so anything else is a hand-made request, and it deserves no
// cookie and no stack trace — the same stance as the cancel action.
export async function setLocaleAction(value: unknown): Promise<void> {
  const parsed = localeSchema.safeParse(value);
  if (parsed.success) await writePreference(LOCALE_COOKIE, parsed.data);
}

export async function setThemeAction(value: unknown): Promise<void> {
  const parsed = themeSchema.safeParse(value);
  if (parsed.success) await writePreference(THEME_COOKIE, parsed.data);
}

async function writePreference(name: string, value: string): Promise<void> {
  const store = await cookies();
  store.set(name, value, {
    path: "/",
    maxAge: PREFERENCE_COOKIE_MAX_AGE,
    sameSite: "lax",
    // Only the server reads these; the toggles get the current value as a
    // prop. Secure in production only, so the cookie still works on
    // http://localhost.
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  });
}
