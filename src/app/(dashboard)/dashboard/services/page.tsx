import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Services",
};

// Placeholder — services CRUD is Day 11. "Removing" a service will always mean
// active = false, never a delete (CLAUDE.md).
export default function ServicesPage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
        Services
      </h1>
      <p className="mt-1 text-sm text-zinc-500">
        Add, edit and retire what you offer. Lands on Day 11.
      </p>
    </div>
  );
}
