"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";

import type { LostSlotState } from "@/app/(public)/b/[slug]/book/actions";
import type {
  BookableSlot,
  StripDay,
} from "@/lib/availability/booking-options";
import type { PublicService } from "@/lib/db/services";
import type { PublicStaff } from "@/lib/db/staff";

import { BookingForm } from "./booking-form";
import { DateStrip } from "./date-strip";
import { SlotGrid, type SlotGridEmptyReason } from "./slot-grid";
import { StaffPicker } from "./staff-picker";

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

  /**
   * Brings "Your details" into view when a time is first chosen.
   *
   * On a phone the form is entirely below the fold — the date strip, the barber
   * chips and a shift's worth of slot buttons sit above it — so tapping a time
   * produced no visible change at all, and the next thing the customer does is
   * tap the same slot again. This is the one piece of behaviour in the mobile
   * pass rather than styling, and it is here because the form's existence is
   * this component's state, not the form's.
   *
   * Keyed on `selectedStartAt`, the number, not on `selectedSlot`, which is
   * re-derived into a new object on every render and would re-fire this
   * endlessly.
   *
   * `block: "nearest"` scrolls the least it can, so a desktop viewport that
   * already shows the form doesn't jump. The reduced-motion check is the same
   * courtesy: an animated scroll nobody asked for is exactly what that
   * preference is set to avoid.
   */
  const detailsRef = useRef<HTMLElement | null>(null);
  const hadSelection = useRef(false);

  useEffect(() => {
    const selecting = selectedStartAt !== null;

    if (selecting && !hadSelection.current) {
      const reduced = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;

      detailsRef.current?.scrollIntoView({
        behavior: reduced ? "auto" : "smooth",
        block: "nearest",
      });
    }

    hadSelection.current = selecting;
  }, [selectedStartAt]);

  // A rejected submission is reported here rather than inside the form, and this
  // is the reason: `selectedSlot` above is *derived* from the server's slot list,
  // so the moment the refresh below lands without that slot in it, the selection
  // collapses to null and the form unmounts — taking any message inside it along
  // with it. The notice has to outlive the form that produced it, and it belongs
  // next to the grid the customer now has to pick from again.
  const [slotLost, setSlotLost] = useState<LostSlotState | null>(null);

  // useCallback because the form calls this from an effect keyed on the action
  // state — a fresh identity every render would re-fire it.
  const handleSlotLost = useCallback(
    (lost: LostSlotState) => {
      setSlotLost(lost);
      // This refresh is REQUIRED, not belt-and-braces. Measured against the dev
      // server rather than assumed: a Server Action that returns a value without
      // calling revalidatePath sends back only that value — a 77-byte response
      // carrying the return object and nothing else — and the page's server
      // component is never re-invoked. The same action with a revalidatePath call
      // came back as a 7.6KB flight tree with a freshly rendered page in it. So
      // absent this line, the customer would be told their slot was taken while
      // still looking at a grid that offers it.
      //
      // revalidatePath inside the action is the other way to get there, and it
      // saves a round trip by folding the new tree into the action response. It's
      // rejected on purpose: it needs the concrete path for a dynamic segment
      // built by hand, and the staleness being fixed is this component's own, so
      // it belongs next to the state that owns it.
      startTransition(() => router.refresh());
    },
    [router],
  );

  function navigate(changes: Record<string, string>) {
    // Any deliberate move to a different date or barber is the customer moving
    // on; the stale notice shouldn't follow them there.
    setSlotLost(null);

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
        {slotLost ? (
          <p
            role="alert"
            className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
          >
            {lostSlotMessage(slotLost, staff)}
          </p>
        ) : null}
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
        <section ref={detailsRef} className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold tracking-tight text-zinc-900">
            Your details
          </h2>
          <BookingForm
            slug={slug}
            service={service}
            date={selectedDate}
            slot={selectedSlot}
            staff={staff}
            timezone={timezone}
            onSlotLost={handleSlotLost}
          />
        </section>
      ) : null}
    </div>
  );
}

/**
 * What to tell a customer whose submission bounced.
 *
 * Each case gets the advice that is actually true for it. `staff_taken` is the
 * one worth care: the time is still open with someone else, and the refreshed
 * form below has already re-resolved to that barber, so the next tap finishes the
 * booking. Telling them to pick a different time there — as a single shared
 * "unavailable" message did — would send them away from a slot they can still have.
 */
function lostSlotMessage(lost: LostSlotState, staff: PublicStaff[]): string {
  switch (lost.status) {
    case "staff_taken": {
      const name = staff.find((member) => member.id === lost.staffId)?.name;

      return `${name ?? "That barber"} was just booked at this time. Another barber is still free — the details below now show who, so you can confirm again.`;
    }
    case "slot_taken":
      return "Someone else booked that time just before you. The times below are up to date — please pick another.";
    case "unavailable":
      return "That time isn't available anymore. The times below are up to date — please pick another.";
  }
}
