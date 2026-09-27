"use client";

import { useActionState } from "react";

import {
  updateBookingRulesAction,
  type BookingRulesFormState,
} from "@/app/(dashboard)/dashboard/settings/actions";
import { Field } from "@/components/ui/field";
import type { BookingRules } from "@/lib/db/tenant";
import { useT } from "@/lib/i18n/client";
import { translateMessage } from "@/lib/i18n/translate";

/**
 * Lives here rather than next to the action: a "use server" module turns every
 * export into a server reference, so a constant exported from there reaches the
 * client as an action proxy instead of this object (CLAUDE.md).
 */
const INITIAL_STATE: BookingRulesFormState = { status: "idle" };

/**
 * The shop's booking rules.
 *
 * Deliberately does NOT reset on success, unlike the create branch of
 * ServiceForm. That form clears because the owner is adding the next service;
 * here the values just saved are the values to keep showing, and blanking them
 * would read as having lost the setting.
 *
 * Uncontrolled inputs with `defaultValue`, so the fields keep what was typed
 * across a failed submit — an owner correcting one bad number must not have the
 * other two reset underneath them.
 */
export function BookingRulesForm({ rules }: { rules: BookingRules }) {
  const [state, formAction, pending] = useActionState<
    BookingRulesFormState,
    FormData
  >(updateBookingRulesAction, INITIAL_STATE);

  const t = useT();
  const errors = state.status === "invalid" ? state.fieldErrors : {};
  // Errors arrive as message keys from the shared schema (lib/validation).
  const errorText = (message: string | undefined) =>
    message ? translateMessage(t, message) : undefined;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {/* No hidden fields at all — not even a row id. The session names the only
          tenant this can write (CLAUDE.md rule 2), so there is deliberately
          nothing here for a tampered value to ride in on. */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          id="bufferMinutes"
          label={t("settings.buffer")}
          inputMode="numeric"
          defaultValue={String(rules.bufferMinutes)}
          placeholder="0"
          hint={t("settings.bufferHint")}
          error={errorText(errors.bufferMinutes)}
        />
        <Field
          id="minLeadMinutes"
          label={t("settings.minLead")}
          inputMode="numeric"
          defaultValue={String(rules.minLeadMinutes)}
          placeholder="60"
          hint={t("settings.minLeadHint")}
          error={errorText(errors.minLeadMinutes)}
        />
        <Field
          id="cancellationWindowMinutes"
          label={t("settings.cancellationWindow")}
          inputMode="numeric"
          defaultValue={String(rules.cancellationWindowMinutes)}
          placeholder="120"
          hint={t("settings.cancellationWindowHint")}
          error={errorText(errors.cancellationWindowMinutes)}
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
          {t("settings.gone")}
        </p>
      ) : null}

      {state.status === "error" ? (
        <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
          {t("common.saveError")}
        </p>
      ) : null}

      <div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-on-primary transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? t("common.saving") : t("settings.submit")}
        </button>
      </div>

      {/* Stated on the form, not in a doc, because these are the three things an
          owner gets wrong the moment they change a value and look at the result.
          The first two are the same shape as the note on the services form: what
          a booking snapshotted at creation, versus what is read live. */}
      <div className="flex flex-col gap-2 text-sm text-fg-muted">
        <p>
          {t("settings.bufferNote")}
        </p>
        <p>
          {t("settings.windowNoteBefore")}{" "}
          <strong className="font-medium text-fg-secondary">
            {t("settings.windowNoteStrong")}
          </strong>{" "}
          {t("settings.windowNoteAfter")}
        </p>
      </div>
    </form>
  );
}
