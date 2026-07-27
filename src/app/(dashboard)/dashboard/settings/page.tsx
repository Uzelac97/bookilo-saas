import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Settings",
};

// Placeholder — Day 12 wires this to the Tenant booking-rule fields: buffer,
// minimum lead time, cancellation window. Opening hours are NOT edited here;
// they're per barber, on the Staff screen.
export default function SettingsPage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
        Settings
      </h1>
      <p className="mt-1 text-sm text-zinc-500">
        Buffer between appointments, minimum notice, cancellation window. Lands
        on Day 12.
      </p>
    </div>
  );
}
