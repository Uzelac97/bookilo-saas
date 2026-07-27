import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Staff",
};

// Placeholder — staff CRUD is Day 11, including each barber's working hours.
// Opening hours live here, per staff member, not on the settings screen: there
// is no business-level hours field by design (EXECUTION-PLAN.md).
export default function StaffPage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
        Staff
      </h1>
      <p className="mt-1 text-sm text-zinc-500">
        Your barbers and the hours each of them works. Lands on Day 11.
      </p>
    </div>
  );
}
