/**
 * A labelled text input with its error and hint wiring.
 *
 * Not a client component and deliberately not marked as one: it renders no
 * interactivity of its own, so it composes into both the server-rendered
 * dashboard forms and the client-rendered booking form. A `"use client"`
 * directive here would pull it — and everything importing it — into the client
 * bundle for no reason.
 *
 * Shared by the public booking form and the services, staff and manual-booking
 * forms. Both styling notes below record a real bug the styling prevents.
 */
export function Field({
  id,
  label,
  type = "text",
  autoComplete,
  inputMode,
  defaultValue,
  placeholder,
  hint,
  error,
}: {
  id: string;
  label: string;
  type?: string;
  autoComplete?: string;
  inputMode?: "text" | "numeric" | "decimal" | "tel" | "email" | "url";
  defaultValue?: string;
  placeholder?: string;
  hint?: string;
  error?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-fg-secondary">
        {label}
      </label>
      <input
        id={id}
        name={id}
        type={type}
        autoComplete={autoComplete}
        inputMode={inputMode}
        defaultValue={defaultValue}
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        // No `required`: validation is the Zod schema's job, so the browser's
        // own messages don't compete with it and say something different.
        className={[
          // text-base, not text-sm — iOS Safari zooms the viewport on focus for
          // anything under 16px, and this is demoed on a phone.
          //
          // bg-surface and text-fg are stated rather than inherited on
          // purpose. Tailwind's preflight resets form controls to
          // `color: inherit; background-color: #0000`, so without these an input
          // renders in whatever colour an ancestor happens to carry — which is
          // how a leftover dark-mode block in globals.css once made these fields
          // near-white text on a white card. Body colour now changes with the
          // theme by design, so this matters more, not less: naming both tokens
          // here keeps text and background flipping together, from one source.
          // src/app/theme-tokens.test.ts fails if any form control drops either.
          // py-2.5 rather than py-2: with a 16px line that is a 46px control,
          // over the 44px touch minimum the rest of this flow now holds to.
          "rounded-lg border bg-surface px-3 py-2.5 text-base text-fg outline-none focus:ring-1",
          error
            ? "border-danger-line-strong focus:border-danger-focus focus:ring-danger-focus"
            : "border-line-strong focus:border-focus focus:ring-focus",
        ].join(" ")}
      />
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-sm text-fg-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
