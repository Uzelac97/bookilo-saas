/**
 * A labelled text input with its error and hint wiring.
 *
 * Not a client component and deliberately not marked as one: it renders no
 * interactivity of its own, so it composes into both the server-rendered
 * dashboard forms and the client-rendered booking form. A `"use client"`
 * directive here would pull it — and everything importing it — into the client
 * bundle for no reason.
 *
 * Extracted from components/booking/booking-form.tsx on Day 11, when the
 * services, staff and manual-booking forms needed the same field. The styling
 * notes below travel with it because both of them were bugs first.
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
      <label htmlFor={id} className="text-sm font-medium text-zinc-700">
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
          // bg-white and text-zinc-900 are stated rather than inherited on
          // purpose. Tailwind's preflight resets form controls to
          // `color: inherit; background-color: #0000`, so without these an input
          // renders in whatever colour an ancestor happens to carry — which is
          // how a leftover dark-mode block in globals.css once made these fields
          // near-white text on a white card. Naming both here means a future
          // change to body colour can't reach back into this input.
          // py-2.5 rather than py-2: with a 16px line that is a 46px control,
          // over the 44px touch minimum the rest of this flow now holds to.
          "rounded-lg border bg-white px-3 py-2.5 text-base text-zinc-900 outline-none focus:ring-1",
          error
            ? "border-red-400 focus:border-red-500 focus:ring-red-500"
            : "border-zinc-300 focus:border-zinc-900 focus:ring-zinc-900",
        ].join(" ")}
      />
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-sm text-red-700">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-sm text-zinc-500">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
