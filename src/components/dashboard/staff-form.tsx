"use client";

import { useActionState } from "react";

import {
  createStaffAction,
  updateStaffAction,
  type StaffFormState,
} from "@/app/(dashboard)/dashboard/staff/actions";
import { Field } from "@/components/ui/field";
import type { ManagedStaff } from "@/lib/db/staff";
import { useT } from "@/lib/i18n/client";
import { translateMessage } from "@/lib/i18n/translate";

/** See the note in service-form.tsx — a "use server" module can't export this. */
const INITIAL_STATE: StaffFormState = { status: "idle" };

/**
 * The add/edit form for one barber.
 *
 * One component for both modes, same reasoning as ServiceForm: identical fields
 * and identical validation, differing only in which action runs and what the
 * button says.
 *
 * Creating redirects to the new barber's own screen, because a barber with no
 * working hours is bookable nowhere and the hours editor is the next thing that
 * has to happen. Editing stays put — the name and the hours are two forms on one
 * screen, and a redirect after a rename would take the owner away from the hours
 * they came to set.
 */
export function StaffForm({ member }: { member?: ManagedStaff }) {
  const editing = member !== undefined;
  const t = useT();
  const [state, formAction, pending] = useActionState<StaffFormState, FormData>(
    editing ? updateStaffAction : createStaffAction,
    INITIAL_STATE,
  );

  // No reset-on-success here, unlike ServiceForm: creating redirects to the new
  // barber's own screen, so this unmounts rather than needing clearing, and the
  // edit form's values are the barber's current ones and should stay.
  const errors = state.status === "invalid" ? state.fieldErrors : {};
  // Errors arrive as message keys from the shared schema (lib/validation).
  const errorText = (message: string | undefined) =>
    message ? translateMessage(t, message) : undefined;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {/* Ordinary form data, scoped again by tenantId inside updateStaff's own
          where clause — see the note in service-form.tsx. */}
      {editing ? (
        <input type="hidden" name="staffId" value={member.id} />
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          id="name"
          label={t("services.name")}
          autoComplete="off"
          defaultValue={member?.name}
          placeholder="Marco Rossi"
          error={errorText(errors.name)}
        />
        <Field
          id="photoUrl"
          label={t("staff.photoLink")}
          type="url"
          inputMode="url"
          defaultValue={member?.photoUrl ?? ""}
          placeholder="https://…"
          hint={t("staff.photoHint")}
          error={errorText(errors.photoUrl)}
        />
      </div>

      {state.status === "saved" ? (
        <p
          role="status"
          className="rounded-lg bg-success-soft px-3 py-2 text-sm text-success"
        >
          {t("common.saved")}
        </p>
      ) : null}

      {state.status === "gone" ? (
        <p
          role="alert"
          className="rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning"
        >
          {t("staff.gone")}
        </p>
      ) : null}

      {state.status === "error" ? (
        <p
          role="alert"
          className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger"
        >
          {t("common.saveError")}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="w-fit rounded-lg bg-primary px-4 py-2 text-sm font-medium text-on-primary transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending
          ? editing
            ? t("common.saving")
            : t("common.adding")
          : editing
            ? t("common.saveChanges")
            : t("staff.submitAdd")}
      </button>

      {!editing ? (
        <p className="text-sm text-fg-muted">
          {t("staff.addNote")}
        </p>
      ) : null}
    </form>
  );
}
