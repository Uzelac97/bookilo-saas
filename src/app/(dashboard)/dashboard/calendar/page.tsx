import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Calendar",
};

// Placeholder so the shell's nav is real and its active-link state is testable.
// The day/week view with staff columns is Day 10.
export default function CalendarPage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
        Calendar
      </h1>
      <p className="mt-1 text-sm text-zinc-500">
        Day and week views, one column per barber. Lands on Day 10.
      </p>
    </div>
  );
}
