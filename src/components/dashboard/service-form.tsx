"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";

import {
  createServiceAction,
  updateServiceAction,
  type ServiceFormState,
} from "@/app/(dashboard)/dashboard/services/actions";
import { Field } from "@/components/ui/field";
import type { ManagedService } from "@/lib/db/services";
import { formatPriceInput } from "@/lib/format";

/**
 * Lives here rather than next to the action: a "use server" module turns every
 * export into a server reference, so a constant exported from there reaches the
 * client as an action proxy instead of this object (CLAUDE.md).
 */
const INITIAL_STATE: ServiceFormState = { status: "idle" };

/**
 * The add/edit form for one service.
 *
 * One component for both modes because the fields, the validation and the
 * messages are identical — the only differences are which action runs, what the
 * button says, and whether there's a row to cancel back to. Two components would
 * be two places for the price field to drift.
 *
 * On edit the action redirects, so this unmounts and there is no success state
 * to render. On create it stays put, because the owner is usually adding their
 * whole menu in one sitting — so the form clears itself and says what it saved.
 */
export function ServiceForm({ service }: { service?: ManagedService }) {
  const editing = service !== undefined;
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState<
    ServiceFormState,
    FormData
  >(editing ? updateServiceAction : createServiceAction, INITIAL_STATE);

  // Uncontrolled inputs keep whatever was typed across a re-render, so adding
  // two services in a row would otherwise start the second one pre-filled with
  // the first. Reset on the success state rather than on every render, or a
  // validation failure would wipe the fields the owner is being asked to fix.
  useEffect(() => {
    if (state.status === "created") formRef.current?.reset();
  }, [state]);

  const errors = state.status === "invalid" ? state.fieldErrors : {};

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-4">
      {/* Ordinary form data, and not a loophole: updateService puts tenantId in
          the same where clause, so an id from another shop matches no rows. The
          session decides whose data this is; the id only says which row. */}
      {editing ? (
        <input type="hidden" name="serviceId" value={service.id} />
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          id="name"
          label="Name"
          defaultValue={service?.name}
          placeholder="Haircut"
          error={errors.name}
        />
        <Field
          id="category"
          label="Category"
          defaultValue={service?.category ?? ""}
          placeholder="Hair"
          hint="Optional — groups services on your public page."
          error={errors.category}
        />
        <Field
          id="durationMinutes"
          label="Length in minutes"
          inputMode="numeric"
          defaultValue={service ? String(service.durationMinutes) : ""}
          placeholder="30"
          hint="How long the chair is taken for."
          error={errors.durationMinutes}
        />
        <Field
          id="priceMinorUnits"
          label="Price in €"
          inputMode="decimal"
          defaultValue={service ? formatPriceInput(service.priceMinorUnits) : ""}
          placeholder="25,00"
          error={errors.priceMinorUnits}
        />
      </div>

      {state.status === "created" ? (
        <p
          role="status"
          className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
        >
          “{state.name}” added.
        </p>
      ) : null}

      {state.status === "gone" ? (
        <p
          role="alert"
          className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900"
        >
          That service no longer exists. Reload the page.
        </p>
      ) : null}

      {state.status === "error" ? (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          Something went wrong and nothing was saved. Please try again.
        </p>
      ) : null}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending
            ? editing
              ? "Saving…"
              : "Adding…"
            : editing
              ? "Save changes"
              : "Add service"}
        </button>

        {editing ? (
          <Link
            href="/dashboard/services"
            className="text-sm text-zinc-500 underline-offset-4 hover:text-zinc-900 hover:underline"
          >
            Cancel
          </Link>
        ) : null}
      </div>

      {editing ? (
        // Stated where the decision is made, because it is the question an owner
        // asks the moment they change a price and look at yesterday's total.
        <p className="text-sm text-zinc-500">
          Changing the length leaves existing appointments as they were booked.
          Changing the price also changes the revenue shown for past
          appointments.
        </p>
      ) : null}
    </form>
  );
}
