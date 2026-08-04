"use server";

import { revalidatePath } from "next/cache";

import { requireSession } from "@/lib/auth/session";
import { updateBookingRules } from "@/lib/db/tenant";
import {
  bookingRulesSchema,
  type BookingRulesInput,
} from "@/lib/validation/settings";

/**
 * What the settings form renders after a submit.
 *
 * `saved` rather than the services form's `created`, and the difference is not
 * cosmetic: there is one tenant and one row, so a save is an edit that leaves the
 * owner looking at the same screen. No redirect either — there is nowhere to go.
 *
 * Nothing but async functions may be exported from this file. `"use server"`
 * rewrites every export into a callable action reference, so an exported initial
 * state would arrive on the client as a function, with no type error to warn you
 * (CLAUDE.md). The initial state lives in the client component. Types are safe:
 * they're erased.
 */
export type BookingRulesFormState =
  | { status: "idle" }
  | { status: "saved" }
  | { status: "invalid"; fieldErrors: BookingRulesFieldErrors }
  | { status: "gone" }
  | { status: "error" };

export type BookingRulesFieldErrors = Partial<
  Record<keyof BookingRulesInput, string>
>;

const SETTINGS_PATH = "/dashboard/settings";

/**
 * Saves the shop's booking rules.
 *
 * The tenant comes from the session and nowhere else — CLAUDE.md rule 2. This
 * form has no tenant field, no shop id, and no hidden input of any kind: unlike
 * the services and staff forms there is not even a row id to carry, because the
 * session already names the only row this can write.
 */
export async function updateBookingRulesAction(
  _prevState: BookingRulesFormState,
  formData: FormData,
): Promise<BookingRulesFormState> {
  const { tenantId } = await requireSession();

  const parsed = bookingRulesSchema.safeParse({
    bufferMinutes: formData.get("bufferMinutes"),
    minLeadMinutes: formData.get("minLeadMinutes"),
    cancellationWindowMinutes: formData.get("cancellationWindowMinutes"),
  });

  if (!parsed.success) {
    const fieldErrors: BookingRulesFieldErrors = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0] as keyof BookingRulesInput;
      fieldErrors[field] ??= issue.message;
    }

    return { status: "invalid", fieldErrors };
  }

  try {
    const result = await updateBookingRules(tenantId, parsed.data);
    if (!result.ok) return { status: "gone" };
  } catch (error) {
    console.error("updateBookingRulesAction failed", error);
    return { status: "error" };
  }

  revalidatePath(SETTINGS_PATH);
  // All three rules are visible to customers, so the public pages have to drop
  // their cached payloads too — same call and same reasoning as the services
  // actions next door. Buffer and lead time shape the slot grid on
  // /b/[slug]/book; the cancellation window is rendered as copy on the
  // confirmation and cancel screens. "layout" rather than "page" so the children
  // of /b/[slug] are covered, not just its index.
  revalidatePath("/b/[slug]", "layout");

  return { status: "saved" };
}
