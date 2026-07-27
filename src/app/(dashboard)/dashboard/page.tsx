import type { Metadata } from "next";

import {
  TodayEmptyState,
  TodayList,
  TodaySummary,
} from "@/components/dashboard/today-list";
import { todayInZone } from "@/lib/availability/booking-options";
import { getCurrentTenant } from "@/lib/auth/session";
import { summariseDay } from "@/lib/dashboard/today-summary";
import { getBookingsForDay } from "@/lib/db/bookings";
import { formatBookingDate } from "@/lib/format";

export const metadata: Metadata = {
  title: "Today",
};

/**
 * The owner's first screen: what's on the books today.
 *
 * The tenant comes from the session and nothing else — the slug in the URL is
 * the *public* resolution path and the two never mix (EXECUTION-PLAN.md §3).
 *
 * One `now` for the whole render, threaded down rather than read again inside
 * the components: the summary and the list both classify bookings as past or
 * upcoming, and two clock reads a few milliseconds apart could disagree across a
 * boundary and put a booking under "next" that the list has already dimmed.
 */
export default async function DashboardPage() {
  const tenant = await getCurrentTenant();
  const now = new Date();

  // "Today" is the shop's today, not the server's — a Berlin shop's day must not
  // roll over because Vercel ran this in UTC. todayInZone already owns that
  // conversion for the public booking flow.
  const date = todayInZone(now, tenant.timezone);

  const bookings = await getBookingsForDay(tenant.id, {
    date,
    timezone: tenant.timezone,
  });
  const summary = summariseDay(bookings, now);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      <div className="flex flex-col gap-6">
        <header className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
            Today
          </h1>
          <p className="text-sm text-zinc-500">
            {formatBookingDate(date, tenant.timezone)} · {tenant.timezone}
          </p>
        </header>

        <TodaySummary
          booked={summary.booked}
          next={summary.next}
          revenueMinorUnits={summary.revenueMinorUnits}
          timezone={tenant.timezone}
        />

        {bookings.length === 0 ? (
          <TodayEmptyState slug={tenant.slug} />
        ) : (
          <TodayList
            bookings={bookings}
            timezone={tenant.timezone}
            now={now}
          />
        )}
      </div>
    </div>
  );
}
