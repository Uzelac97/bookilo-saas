"use client";

import { useFormStatus } from "react-dom";

/**
 * The submit button for the cancel form.
 *
 * A client component for one reason: useFormStatus has to be rendered *inside*
 * the form it reports on, and the page around it is a server component. Without
 * it, a customer on a phone gets no acknowledgement between tapping and the
 * round trip finishing, and taps again. The duplicate submit is harmless — the
 * write is a conditional updateMany, so the second one matches nothing — but
 * silence on a destructive action still reads as a broken page.
 *
 * Deliberately not a confirmation dialog. The page itself is the confirmation
 * step: the customer arrived from a link, and is looking at the appointment's
 * date, time, barber and price directly above this button.
 */
export function CancelButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex min-h-12 items-center justify-center self-start rounded-lg border border-red-300 bg-white px-4 text-base font-medium text-red-700 transition-colors hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700 disabled:cursor-not-allowed disabled:border-zinc-200 disabled:text-zinc-400"
    >
      {pending ? "Cancelling…" : "Cancel appointment"}
    </button>
  );
}
