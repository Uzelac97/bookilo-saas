"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

import type {
  BookableSlot,
  StripDay,
} from "@/lib/availability/booking-options";
import type { PublicService } from "@/lib/db/services";
import type { PublicStaff } from "@/lib/db/staff";

import { BookingForm } from "./booking-form";
import { DateStrip } from "./date-strip";
import { SlotGrid, type SlotGridEmptyReason } from "./slot-grid";
import { ANY_STAFF, StaffPicker } from "./staff-picker";

/**
 * The only component that writes the URL.
 *
 * The rule this file exists to hold: **the URL carries what the server needs to
 * render.** `date` and `staff` change which slots get computed, so they live in
 * searchParams and a change to either is a navigation — the page is a server
 * component and recomputes availability from the database on every one. The
 * chosen *slot* changes nothing server-side, so it stays local state; putting an
 * instant in the URL would only invite a stale one to be restored later.
 *
 * That's also why there is no client-side fetching here, no loading skeleton and
 * no cache to invalidate. `useTransition` gives us the pending flag while the
 * server render is in flight, and the previous slots stay on screen (dimmed)
 * instead of collapsing the layout.
 */
export function BookingFlow({
  slug,
  service,
  staff,
  slots,
  stripDays,
  selectedDate,
  selectedStaffId,
  canGoBack,
  canGoForward,
  nextWeekDate,
  previousWeekDate,
  emptyReason,
  timezone,
}: {
  slug: string;
  service: PublicService;
  staff: PublicStaff[];
  slots: BookableSlot[];
  stripDays: StripDay[];
  selectedDate: string;
  selectedStaffId: string;
  canGoBack: boolean;
  canGoForward: boolean;
  nextWeekDate: string;
  previousWeekDate: string;
  emptyReason: SlotGridEmptyReason;
  timezone: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  // State holds the chosen *instant*, not the slot object, and the slot is
  // derived from whatever the server most recently offered. That derivation is
  // what keeps a stale selection from surviving a date change: a time picked on
  // Tuesday is simply not in Wednesday's list, so it falls out on its own —
  // no effect resetting state, and no window where the summary describes a
  // booking nobody chose.
  //
  // It also preserves the selection when it genuinely still holds: switching
  // from "Any barber" to Marco keeps 14:30 selected if Marco is free then.
  const [selectedStartAt, setSelectedStartAt] = useState<number | null>(null);
  const selectedSlot =
    slots.find((slot) => slot.startAt.getTime() === selectedStartAt) ?? null;

  function navigate(changes: Record<string, string>) {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(changes)) {
      next.set(key, value);
    }

    startTransition(() => {
      // replace, not push: paging through a week of dates should not bury the
      // business page under a dozen back-button steps.
      router.replace(`/b/${slug}/book?${next.toString()}`, { scroll: false });
    });
  }

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold tracking-tight text-zinc-900">
          Pick a date
        </h2>
        <DateStrip
          days={stripDays}
          selectedDate={selectedDate}
          timezone={timezone}
          canGoBack={canGoBack}
          canGoForward={canGoForward}
          pending={pending}
          onSelect={(date) => navigate({ date })}
          onPage={(weeks) =>
            navigate({ date: weeks < 0 ? previousWeekDate : nextWeekDate })
          }
        />
        <StaffPicker
          staff={staff}
          selectedStaffId={selectedStaffId}
          pending={pending}
          onSelect={(staffId) => navigate({ staff: staffId })}
        />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold tracking-tight text-zinc-900">
          Pick a time
        </h2>
        <SlotGrid
          slots={slots}
          selectedStartAt={selectedSlot?.startAt ?? null}
          timezone={timezone}
          emptyReason={emptyReason}
          pending={pending}
          onSelect={(slot) => setSelectedStartAt(slot.startAt.getTime())}
        />
      </section>

      {selectedSlot ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold tracking-tight text-zinc-900">
            Your details
          </h2>
          <BookingForm
            service={service}
            date={selectedDate}
            slot={selectedSlot}
            staff={staff}
            timezone={timezone}
          />
        </section>
      ) : null}
    </div>
  );
}

export { ANY_STAFF };
