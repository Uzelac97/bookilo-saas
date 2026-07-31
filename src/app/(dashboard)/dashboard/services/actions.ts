"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireSession } from "@/lib/auth/session";
import {
  createService,
  setServiceActive,
  updateService,
} from "@/lib/db/services";
import { serviceInputSchema, type ServiceInput } from "@/lib/validation/service";

/**
 * What the services form renders after a submit.
 *
 * `created` exists where the booking action has nothing: a create leaves the
 * owner on the same screen adding the next service, so there is a success to
 * report and a form to clear. The edit path has no success state because it
 * redirects, which unmounts the form.
 *
 * Nothing but async functions may be exported from this file. `"use server"`
 * rewrites every export into a callable action reference, so an exported initial
 * state would arrive on the client as a function — with no type error to warn
 * you (CLAUDE.md). The initial state lives in the client component. Types are
 * safe to export: they're erased.
 */
export type ServiceFormState =
  | { status: "idle" }
  | { status: "created"; name: string }
  | { status: "invalid"; fieldErrors: ServiceFieldErrors }
  | { status: "gone" }
  | { status: "error" };

export type ServiceFieldErrors = Partial<Record<keyof ServiceInput, string>>;

const SERVICES_PATH = "/dashboard/services";

/**
 * Drops the public pages from the caches, because every write here changes what
 * a customer sees.
 *
 * The build reports `/b/[slug]` and its children as dynamic today, so there is
 * no full route cache to bust. What this actually clears is the *client* router
 * cache — and that path is real rather than theoretical: the dashboard header
 * carries a "View public page" link, so an owner who retires a service and
 * immediately clicks it is exactly the person who would be served the stale
 * payload. It also keeps this correct if those routes ever gain
 * generateStaticParams or a `revalidate` export.
 *
 * "layout" rather than "page": "page" would cover `/b/[slug]` alone and leave
 * `/b/[slug]/book` showing the retired service in its picker. The literal
 * `[slug]` is the route pattern, so it covers every tenant — a dashboard session
 * carries a tenantId, not a slug.
 */
function revalidatePublicPages() {
  revalidatePath("/b/[slug]", "layout");
}

/** Adds a service to the signed-in owner's shop. */
export async function createServiceAction(
  _prevState: ServiceFormState,
  formData: FormData,
): Promise<ServiceFormState> {
  // The tenant comes from the session and nowhere else — CLAUDE.md rule 2. A
  // tenantId in this form data would be ignored; there is deliberately nowhere
  // for one to be read from.
  const { tenantId } = await requireSession();

  const parsed = parseForm(formData);
  if (!parsed.ok) return parsed.state;

  try {
    await createService(tenantId, parsed.input);
  } catch (error) {
    console.error("createServiceAction failed", error);
    return { status: "error" };
  }

  revalidatePath(SERVICES_PATH);
  revalidatePublicPages();

  return { status: "created", name: parsed.input.name };
}

/**
 * Edits a service.
 *
 * The service id arrives as ordinary form data, which is fine and is not a
 * loophole: updateService puts `tenantId` in the same `where` clause, so an id
 * belonging to another shop matches no rows and comes back NOT_FOUND. The
 * session decides whose data this is; the id only says which row within it.
 */
export async function updateServiceAction(
  _prevState: ServiceFormState,
  formData: FormData,
): Promise<ServiceFormState> {
  const { tenantId } = await requireSession();

  const serviceId = String(formData.get("serviceId") ?? "");
  if (!serviceId) return { status: "gone" };

  const parsed = parseForm(formData);
  if (!parsed.ok) return parsed.state;

  try {
    const result = await updateService(tenantId, serviceId, parsed.input);
    if (!result.ok) return { status: "gone" };
  } catch (error) {
    console.error("updateServiceAction failed", error);
    return { status: "error" };
  }

  revalidatePath(SERVICES_PATH);
  revalidatePublicPages();
  // Outside the try block: redirect() signals by throwing, and a catch would
  // swallow it and leave the owner staring at a form that appeared to do
  // nothing. Same trap as loginAction and submitBooking.
  redirect(SERVICES_PATH);
}

/**
 * Retires a service, or brings one back.
 *
 * A plain action rather than a useActionState one: there is nothing to validate
 * and nothing to say back except the redrawn list. "Retiring" is always
 * `active = false` — there is no delete action here and no delete helper in
 * lib/db/services.ts to call (CLAUDE.md).
 */
export async function setServiceActiveAction(formData: FormData): Promise<void> {
  const { tenantId } = await requireSession();

  const serviceId = String(formData.get("serviceId") ?? "");
  const active = formData.get("active") === "true";

  if (!serviceId) return;

  const result = await setServiceActive(tenantId, serviceId, active);
  if (!result.ok) {
    // The row is gone or was never this tenant's. Nothing to tell the owner that
    // the redrawn list won't show them anyway.
    console.error(
      `setServiceActiveAction: no service ${serviceId} for tenant ${tenantId}`,
    );
  }

  revalidatePath(SERVICES_PATH);
  revalidatePublicPages();
}

/**
 * Validates the four service fields, shared by create and edit so the two can't
 * disagree about what a valid service is.
 *
 * Returns a discriminated result rather than throwing: an invalid form is an
 * expected outcome the owner fixes by typing, not an exception.
 */
function parseForm(
  formData: FormData,
):
  | { ok: true; input: ServiceInput }
  | { ok: false; state: ServiceFormState } {
  const parsed = serviceInputSchema.safeParse({
    name: formData.get("name"),
    durationMinutes: formData.get("durationMinutes"),
    priceMinorUnits: formData.get("priceMinorUnits"),
    category: formData.get("category"),
  });

  if (parsed.success) return { ok: true, input: parsed.data };

  const fieldErrors: ServiceFieldErrors = {};
  for (const issue of parsed.error.issues) {
    const field = issue.path[0] as keyof ServiceInput;
    fieldErrors[field] ??= issue.message;
  }

  return { ok: false, state: { status: "invalid", fieldErrors } };
}
