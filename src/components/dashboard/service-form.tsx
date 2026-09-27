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
import { useT } from "@/lib/i18n/client";
import { translateMessage } from "@/lib/i18n/translate";

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
  const t = useT();
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
  // Errors arrive as message keys from the shared schema (lib/validation).
  const errorText = (message: string | undefined) =>
    message ? translateMessage(t, message) : undefined;

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
          label={t("services.name")}
          defaultValue={service?.name}
          placeholder={t("services.namePlaceholder")}
          error={errorText(errors.name)}
        />
        <Field
          id="category"
          label={t("services.category")}
          defaultValue={service?.category ?? ""}
          placeholder={t("services.categoryPlaceholder")}
          hint={t("services.categoryHint")}
          error={errorText(errors.category)}
        />
        <Field
          id="durationMinutes"
          label={t("services.length")}
          inputMode="numeric"
          defaultValue={service ? String(service.durationMinutes) : ""}
          placeholder="30"
          hint={t("services.lengthHint")}
          error={errorText(errors.durationMinutes)}
        />
        <Field
          id="priceMinorUnits"
          label={t("services.price")}
          inputMode="decimal"
          defaultValue={service ? formatPriceInput(service.priceMinorUnits) : ""}
          placeholder="25,00"
          error={errorText(errors.priceMinorUnits)}
        />
      </div>

      {state.status === "created" ? (
        <p
          role="status"
          className="rounded-lg bg-success-soft px-3 py-2 text-sm text-success"
        >
          {t("services.added", { name: state.name })}
        </p>
      ) : null}

      {state.status === "gone" ? (
        <p
          role="alert"
          className="rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning"
        >
          {t("services.gone")}
        </p>
      ) : null}

      {state.status === "error" ? (
        <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
          {t("common.saveError")}
        </p>
      ) : null}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-on-primary transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending
            ? editing
              ? t("common.saving")
              : t("common.adding")
            : editing
              ? t("common.saveChanges")
              : t("services.submitAdd")}
        </button>

        {editing ? (
          <Link
            href="/dashboard/services"
            className="text-sm text-fg-muted underline-offset-4 hover:text-fg hover:underline"
          >
            {t("common.cancel")}
          </Link>
        ) : null}
      </div>

      {editing ? (
        // Stated where the decision is made, because it is the question an owner
        // asks the moment they change a price and look at yesterday's total.
        <p className="text-sm text-fg-muted">
          {t("services.editNote")}
        </p>
      ) : null}
    </form>
  );
}
