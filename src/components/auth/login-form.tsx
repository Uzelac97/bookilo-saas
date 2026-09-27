"use client";

import { useActionState } from "react";

import { loginAction, type LoginState } from "@/app/login/actions";
import { useT } from "@/lib/i18n/client";
import { translateMessage } from "@/lib/i18n/translate";

const initialState: LoginState = { error: null };

export function LoginForm({ callbackUrl }: { callbackUrl: string }) {
  const [state, formAction, pending] = useActionState(loginAction, initialState);
  const t = useT();

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="callbackUrl" value={callbackUrl} />

      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-sm font-medium text-fg-secondary">
          {t("common.email")}
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          className="rounded-lg border border-line-strong bg-surface px-3 py-2 text-base text-fg outline-none focus:border-focus focus:ring-1 focus:ring-focus"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="text-sm font-medium text-fg-secondary">
          {t("login.password")}
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="rounded-lg border border-line-strong bg-surface px-3 py-2 text-base text-fg outline-none focus:border-focus focus:ring-1 focus:ring-focus"
        />
      </div>

      {state.error ? (
        <p
          role="alert"
          className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger"
        >
          {translateMessage(t, state.error)}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="mt-2 rounded-lg bg-primary px-4 py-2.5 text-base font-medium text-on-primary transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? t("login.submitting") : t("login.submit")}
      </button>
    </form>
  );
}
