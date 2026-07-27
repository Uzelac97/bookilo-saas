"use server";

import { signOut } from "@/lib/auth/auth";

/**
 * Sign the owner out and send them to the login page.
 *
 * Lives in its own module because the header that renders the button is in the
 * dashboard layout: an inline `"use server"` closure can't be shared across the
 * shell, and it can't be reached from a client component at all.
 *
 * Nothing else may be exported from this file. `"use server"` rewrites every
 * export into a callable action reference, so a constant added here would arrive
 * on the client as a function — with no type error to warn you (CLAUDE.md).
 */
export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: "/login" });
}
