import Link from "next/link";

import type { DashboardBooking } from "@/lib/db/bookings";
import { formatPrice, formatSlotTime, formatTimeRange } from "@/lib/format";

/**
 * How each status reads on the overview.
 *
 * CONFIRMED has no label on purpose: it's the overwhelming majority of rows, and
 * badging every one of them would make the two that matter harder to spot, not
 * easier.
 */
const STATUS_LABELS: Record<DashboardBooking["status"], string | null> = {
  CONFIRMED: null,
  CANCELLED: "Cancelled",
  COMPLETED: "Done",
  NO_SHOW: "No-show",
};

const STATUS_BADGE_STYLES: Record<DashboardBooking["status"], string> = {
  CONFIRMED: "",
  CANCELLED: "border-zinc-200 bg-zinc-100 text-zinc-500",
  COMPLETED: "border-emerald-200 bg-emerald-50 text-emerald-700",
  NO_SHOW: "border-amber-200 bg-amber-100 text-amber-800",
};

/**
 * Today's appointments for one shop.
 *
 * Read-only. Marking someone complete or a no-show from here is Day 11 — the
 * statuses render because the data has them, not because this screen can set
 * them yet.
 *
 * `now` is passed in rather than read here so the whole page renders against one
 * instant: a component that called new Date() itself could classify a booking as
 * past in the summary and upcoming in the list, on the same screen.
 */
export function TodayList({
  bookings,
  timezone,
  now,
}: {
  bookings: DashboardBooking[];
  timezone: string;
  now: Date;
}) {
  if (bookings.length === 0) return null;

  return (
    <ul className="flex flex-col gap-2">
      {bookings.map((booking) => (
        <BookingRow
          key={booking.id}
          booking={booking}
          timezone={timezone}
          now={now}
        />
      ))}
    </ul>
  );
}

function BookingRow({
  booking,
  timezone,
  now,
}: {
  booking: DashboardBooking;
  timezone: string;
  now: Date;
}) {
  const cancelled = booking.status === "CANCELLED";
  // Past by end time, not start: an appointment in progress is still today's
  // business and shouldn't grey out the moment it begins.
  const past = booking.endAt.getTime() <= now.getTime();
  const statusLabel = STATUS_LABELS[booking.status];

  return (
    <li
      className={[
        "rounded-2xl border border-zinc-200 bg-white p-4 transition-opacity",
        past || cancelled ? "opacity-55" : "",
      ].join(" ")}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span
          className={[
            "font-mono text-sm text-zinc-900",
            cancelled ? "line-through" : "",
          ].join(" ")}
        >
          {formatTimeRange(booking.startAt, booking.endAt, timezone)}
        </span>

        <span className="text-sm text-zinc-500">{booking.staff.name}</span>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
        <span
          className={[
            "font-medium text-zinc-900",
            cancelled ? "line-through" : "",
          ].join(" ")}
        >
          {booking.customer.name}
        </span>

        {statusLabel ? (
          <span
            className={`rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_BADGE_STYLES[booking.status]}`}
          >
            {statusLabel}
          </span>
        ) : null}

        {booking.source === "MANUAL" ? (
          <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-xs font-medium text-zinc-600">
            Walk-in
          </span>
        ) : null}
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-zinc-600">
        <span className={cancelled ? "line-through" : ""}>
          {booking.service.name}
        </span>
        <span aria-hidden="true" className="text-zinc-300">
          ·
        </span>
        {/* Strip spaces for the dial target only — the visible number keeps the
            formatting the customer typed. */}
        <a
          href={`tel:${booking.customer.phone.replace(/\s+/g, "")}`}
          className="font-medium text-zinc-900 underline-offset-4 hover:underline"
        >
          {booking.customer.phone}
        </a>
      </div>
    </li>
  );
}

/**
 * The day at a glance. Rendered above the list, and on its own when there is no
 * list — a fresh shop's dashboard is an empty day, not an error.
 */
export function TodaySummary({
  booked,
  next,
  revenueMinorUnits,
  timezone,
}: {
  booked: number;
  next: DashboardBooking | null;
  revenueMinorUnits: number;
  timezone: string;
}) {
  return (
    <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-200">
      <SummaryCell
        label="Booked"
        value={String(booked)}
        detail={booked === 1 ? "appointment" : "appointments"}
      />
      <SummaryCell
        label="Next"
        value={next ? formatSlotTime(next.startAt, timezone) : "—"}
        detail={next ? next.customer.name : "nothing left today"}
      />
      <SummaryCell
        label="Booked value"
        value={formatPrice(revenueMinorUnits)}
        detail="excl. no-shows"
      />
    </dl>
  );
}

function SummaryCell({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="flex flex-col gap-0.5 bg-white p-4">
      <dt className="text-xs font-medium tracking-wide text-zinc-500 uppercase">
        {label}
      </dt>
      <dd className="text-xl font-semibold tracking-tight text-zinc-900">
        {value}
      </dd>
      <span className="truncate text-xs text-zinc-500">{detail}</span>
    </div>
  );
}

/** Shown when nothing is on the books — the default view of a brand-new shop. */
export function TodayEmptyState({ slug }: { slug: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-8 text-center">
      <p className="font-medium text-zinc-900">No appointments today</p>
      <p className="mt-1 text-sm text-zinc-500">
        Bookings made on your{" "}
        <Link
          href={`/b/${slug}`}
          className="font-medium text-zinc-900 underline underline-offset-4"
        >
          public page
        </Link>{" "}
        show up here.
      </p>
    </div>
  );
}
