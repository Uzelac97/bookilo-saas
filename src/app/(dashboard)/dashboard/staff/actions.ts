"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireSession } from "@/lib/auth/session";
import {
  createStaff,
  replaceWorkingHours,
  setStaffActive,
  updateStaff,
} from "@/lib/db/staff";
import {
  staffInputSchema,
  toWorkingHoursRows,
  workingHoursPayloadSchema,
  type StaffInput,
} from "@/lib/validation/staff";

/**
 * What the barber form renders after a submit.
 *
 * `saved` rather than a redirect on the edit path: the name and the hours are
 * two forms on the same screen, and bouncing the owner elsewhere after renaming
 * someone would take the hours they were about to set with it.
 *
 * Only async functions may be exported from this file — `"use server"` turns
 * every export into a callable action reference (CLAUDE.md). Types are erased,
 * so they're safe.
 */
export type StaffFormState =
  | { status: "idle" }
  | { status: "saved" }
  | { status: "invalid"; fieldErrors: StaffFieldErrors }
  | { status: "gone" }
  | { status: "error" };

export type StaffFieldErrors = Partial<Record<keyof StaffInput, string>>;

/** What the working-hours editor renders after a save. */
export type WorkingHoursState =
  | { status: "idle" }
  | { status: "saved" }
  | { status: "invalid"; message: string }
  | { status: "gone" }
  | { status: "error" };

const STAFF_PATH = "/dashboard/staff";

/**
 * Drops the public pages from the caches — see the fuller note on the twin of
 * this function in ../services/actions.ts for what that does and doesn't clear.
 *
 * Every write in this file is visible to customers, and the hours are the
 * surprising one: they *are* the shop's opening hours. There is no
 * business-level hours field, so "closed Sunday" is simply the absence of Sunday
 * rows (EXECUTION-PLAN.md) — setting a barber's shift changes what the shop page
 * says it's open, not only what the slot grid offers.
 */
function revalidatePublicPages() {
  revalidatePath("/b/[slug]", "layout");
}

/**
 * Adds a barber, then sends the owner straight to their hours.
 *
 * The redirect is the point, not a convenience. createStaff deliberately writes
 * no working hours — opening hours are the union of what the staff work, so
 * inventing a default would change what the public page says the shop's hours
 * are as a side effect of hiring someone. A barber with no hours is bookable
 * nowhere, so the next screen has to be the one that fixes that.
 */
export async function createStaffAction(
  _prevState: StaffFormState,
  formData: FormData,
): Promise<StaffFormState> {
  const { tenantId } = await requireSession();

  const parsed = parseStaffForm(formData);
  if (!parsed.ok) return parsed.state;

  let staffId: string;

  try {
    const created = await createStaff(tenantId, parsed.input);
    staffId = created.id;
  } catch (error) {
    console.error("createStaffAction failed", error);
    return { status: "error" };
  }

  revalidatePath(STAFF_PATH);
  // Outside the try: redirect() signals by throwing, and a catch would swallow
  // it and leave the owner looking at a form that appeared to do nothing.
  redirect(`${STAFF_PATH}/${staffId}`);
}

/** Renames a barber, or changes their photo. */
export async function updateStaffAction(
  _prevState: StaffFormState,
  formData: FormData,
): Promise<StaffFormState> {
  const { tenantId } = await requireSession();

  const staffId = String(formData.get("staffId") ?? "");
  if (!staffId) return { status: "gone" };

  const parsed = parseStaffForm(formData);
  if (!parsed.ok) return parsed.state;

  try {
    const result = await updateStaff(tenantId, staffId, parsed.input);
    if (!result.ok) return { status: "gone" };
  } catch (error) {
    console.error("updateStaffAction failed", error);
    return { status: "error" };
  }

  revalidatePath(STAFF_PATH);
  revalidatePath(`${STAFF_PATH}/${staffId}`);
  // A rename shows up in the customer's barber picker.
  revalidatePublicPages();

  return { status: "saved" };
}

/**
 * Replaces a barber's whole week of working hours.
 *
 * The payload arrives as one JSON field because the editor holds a variable
 * number of intervals per day in client state — see workingHoursPayloadSchema.
 * It is parsed and validated here like any other input; being our own field
 * buys it no trust.
 */
export async function saveWorkingHoursAction(
  _prevState: WorkingHoursState,
  formData: FormData,
): Promise<WorkingHoursState> {
  const { tenantId } = await requireSession();

  const staffId = String(formData.get("staffId") ?? "");
  if (!staffId) return { status: "gone" };

  let payload: unknown;
  try {
    payload = JSON.parse(String(formData.get("hours") ?? "[]"));
  } catch {
    return { status: "invalid", message: "Those hours couldn't be read. Reload the page." };
  }

  const parsed = workingHoursPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    return { status: "invalid", message: "Those hours couldn't be read. Reload the page." };
  }

  const rows = toWorkingHoursRows(parsed.data);
  if (!rows.ok) return { status: "invalid", message: rows.message };

  try {
    const result = await replaceWorkingHours(tenantId, staffId, rows.rows);
    if (!result.ok) return { status: "gone" };
  } catch (error) {
    console.error("saveWorkingHoursAction failed", error);
    return { status: "error" };
  }

  revalidatePath(STAFF_PATH);
  revalidatePath(`${STAFF_PATH}/${staffId}`);
  revalidatePublicPages();

  return { status: "saved" };
}

/**
 * Retires a barber, or brings one back. Always `active = false`, never a delete
 * (CLAUDE.md) — there is no delete helper in lib/db/staff.ts to call.
 */
export async function setStaffActiveAction(formData: FormData): Promise<void> {
  const { tenantId } = await requireSession();

  const staffId = String(formData.get("staffId") ?? "");
  const active = formData.get("active") === "true";

  if (!staffId) return;

  const result = await setStaffActive(tenantId, staffId, active);
  if (!result.ok) {
    console.error(
      `setStaffActiveAction: no staff ${staffId} for tenant ${tenantId}`,
    );
  }

  revalidatePath(STAFF_PATH);
  // getWorkingHoursForActiveStaff filters on `active`, so deactivating someone
  // withdraws their hours from the shop's published opening hours.
  revalidatePublicPages();

  redirect(STAFF_PATH);
}

/** Validates the barber fields, shared by create and edit. */
function parseStaffForm(
  formData: FormData,
): { ok: true; input: StaffInput } | { ok: false; state: StaffFormState } {
  const parsed = staffInputSchema.safeParse({
    name: formData.get("name"),
    photoUrl: formData.get("photoUrl"),
  });

  if (parsed.success) return { ok: true, input: parsed.data };

  const fieldErrors: StaffFieldErrors = {};
  for (const issue of parsed.error.issues) {
    const field = issue.path[0] as keyof StaffInput;
    fieldErrors[field] ??= issue.message;
  }

  return { ok: false, state: { status: "invalid", fieldErrors } };
}
