"use client";

import { useActionState } from "react";

import {
  createStaffAction,
  updateStaffAction,
  type StaffFormState,
} from "@/app/(dashboard)/dashboard/staff/actions";
import { Field } from "@/components/ui/field";
import type { ManagedStaff } from "@/lib/db/staff";

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
  const [state, formAction, pending] = useActionState<StaffFormState, FormData>(
    editing ? updateStaffAction : createStaffAction,
    INITIAL_STATE,
  );

  // No reset-on-success here, unlike ServiceForm: creating redirects to the new
  // barber's own screen, so this unmounts rather than needing clearing, and the
  // edit form's values are the barber's current ones and should stay.
  const errors = state.status === "invalid" ? state.fieldErrors : {};

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
          label="Name"
          autoComplete="off"
          defaultValue={member?.name}
          placeholder="Marco Rossi"
          error={errors.name}
        />
        <Field
          id="photoUrl"
          label="Photo link"
          type="url"
          inputMode="url"
          defaultValue={member?.photoUrl ?? ""}
          placeholder="https://…"
          hint="Optional — shown on your public page."
          error={errors.photoUrl}
        />
      </div>

      {state.status === "saved" ? (
        <p
          role="status"
          className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
        >
          Saved.
        </p>
      ) : null}

      {state.status === "gone" ? (
        <p
          role="alert"
          className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900"
        >
          That barber no longer exists. Reload the page.
        </p>
      ) : null}

      {state.status === "error" ? (
        <p
          role="alert"
          className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          Something went wrong and nothing was saved. Please try again.
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="w-fit rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending
          ? editing
            ? "Saving…"
            : "Adding…"
          : editing
            ? "Save changes"
            : "Add barber"}
      </button>

      {!editing ? (
        <p className="text-sm text-zinc-500">
          You&rsquo;ll set their working hours next. Until then they aren&rsquo;t
          bookable.
        </p>
      ) : null}
    </form>
  );
}
