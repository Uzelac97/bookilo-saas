"use client";

import { DateTime } from "luxon";

import type { BookableSlot } from "@/lib/availability/booking-options";
import { formatSlotTime } from "@/lib/format";

/**
 * Why groups exist: a 09:00–18:00 shift on a 15-minute grid is ~34 buttons, and
 * an undifferentiated wall of them is hard to scan on a phone. Boundaries are
 * plain wall-clock hours in the tenant's zone, not a Tenant setting.
 */
const PARTS = [
  { label: "Morning", untilHour: 12 },
  { label: "Afternoon", untilHour: 17 },
  { label: "Evening", untilHour: 24 },
] as const;

export type SlotGridEmptyReason = "CLOSED" | "FULLY_BOOKED";

export function SlotGrid({
  slots,
  selectedStartAt,
  timezone,
  emptyReason,
  pending,
  onSelect,
}: {
  slots: BookableSlot[];
  selectedStartAt: Date | null;
  timezone: string;
  emptyReason: SlotGridEmptyReason;
  pending: boolean;
  onSelect: (slot: BookableSlot) => void;
}) {
  if (slots.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-zinc-300 px-4 py-8 text-center text-sm text-zinc-500">
        {emptyReason === "CLOSED"
          ? "Closed on this day."
          : "Fully booked — try another day."}
      </p>
    );
  }

  const groups = groupByPartOfDay(slots, timezone);

  return (
    <div
      className={[
        "flex flex-col gap-5 transition-opacity",
        // The page re-renders on the server for every date change, so the grid
        // is briefly stale rather than empty. Dimming it says "working" without
        // a layout-shifting skeleton.
        pending ? "opacity-50" : "opacity-100",
      ].join(" ")}
    >
      {groups.map((group) => (
        <div key={group.label}>
          {groups.length > 1 ? (
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
              {group.label}
            </h3>
          ) : null}

          <div
            role="group"
            aria-label={`${group.label} times`}
            className="grid grid-cols-[repeat(auto-fill,minmax(4.5rem,1fr))] gap-2"
          >
            {group.slots.map((slot) => {
              const selected =
                selectedStartAt !== null &&
                selectedStartAt.getTime() === slot.startAt.getTime();

              return (
                <button
                  key={slot.startAt.getTime()}
                  type="button"
                  aria-pressed={selected}
                  disabled={pending}
                  onClick={() => onSelect(slot)}
                  className={[
                    // min-h-11 (44px) rather than the py-2 that produced ~36px.
                    // These are the densest tap targets in the product — a
                    // 09:00–18:00 shift is thirty-odd of them side by side on a
                    // phone — so they are the ones where an undersized target
                    // actually costs a mis-tap.
                    "flex min-h-11 items-center justify-center rounded-lg border px-2 text-sm font-medium tabular-nums transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 disabled:cursor-not-allowed",
                    selected
                      ? "border-zinc-900 bg-zinc-900 text-white"
                      : "border-zinc-200 bg-white text-zinc-900 hover:border-zinc-400",
                  ].join(" ")}
                >
                  {formatSlotTime(slot.startAt, timezone)}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * An order-preserving fold over already-sorted slots, same approach as
 * groupByCategory in service-list.tsx — empty groups are dropped rather than
 * rendered as a heading with nothing under it.
 */
function groupByPartOfDay(
  slots: BookableSlot[],
  timezone: string,
): { label: string; slots: BookableSlot[] }[] {
  const groups = PARTS.map((part) => ({
    label: part.label,
    slots: [] as BookableSlot[],
  }));

  for (const slot of slots) {
    // The tenant's zone, not the browser's: a customer abroad must see the
    // shop's morning as morning.
    const hour = DateTime.fromJSDate(slot.startAt).setZone(timezone).hour;
    const index = PARTS.findIndex((part) => hour < part.untilHour);

    groups[index === -1 ? PARTS.length - 1 : index].slots.push(slot);
  }

  return groups.filter((group) => group.slots.length > 0);
}
