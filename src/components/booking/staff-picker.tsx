"use client";

import { ANY_STAFF } from "@/lib/availability/booking-options";
import type { PublicStaff } from "@/lib/db/staff";
import { useT } from "@/lib/i18n/client";

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
  const t = useT();

  if (staff.length < 2) return null;

  const options = [{ id: ANY_STAFF, name: t("book.anyBarber") }, ...staff];

  return (
    <div
      role="group"
      aria-label={t("book.preferredBarber")}
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
              "inline-flex min-h-11 items-center rounded-full border px-4 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:opacity-60",
              selected
                ? "border-primary bg-primary text-on-primary"
                : "border-line bg-surface text-fg-secondary hover:border-line-stronger",
            ].join(" ")}
          >
            {option.name}
          </button>
        );
      })}
    </div>
  );
}
