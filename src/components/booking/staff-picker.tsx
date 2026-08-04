"use client";

import { ANY_STAFF } from "@/lib/availability/booking-options";
import type { PublicStaff } from "@/lib/db/staff";

/**
 * Optional barber preference. "Any barber" is the default and is listed first:
 * for a 1–3 chair shop most customers genuinely don't mind, and it's the option
 * that shows the most availability.
 *
 * Hidden entirely for a single-barber shop, where the choice is not a choice.
 */
export function StaffPicker({
  staff,
  selectedStaffId,
  pending,
  onSelect,
}: {
  staff: PublicStaff[];
  selectedStaffId: string;
  pending: boolean;
  onSelect: (staffId: string) => void;
}) {
  if (staff.length < 2) return null;

  const options = [{ id: ANY_STAFF, name: "Any barber" }, ...staff];

  return (
    <div
      role="group"
      aria-label="Preferred barber"
      className="flex flex-wrap gap-2"
    >
      {options.map((option) => {
        const selected = option.id === selectedStaffId;

        return (
          <button
            key={option.id}
            type="button"
            aria-pressed={selected}
            disabled={pending}
            onClick={() => onSelect(option.id)}
            className={[
              // Was py-1.5 — a 32px pill, the smallest target in the flow.
              "inline-flex min-h-11 items-center rounded-full border px-4 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 disabled:opacity-60",
              selected
                ? "border-zinc-900 bg-zinc-900 text-white"
                : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-400",
            ].join(" ")}
          >
            {option.name}
          </button>
        );
      })}
    </div>
  );
}
