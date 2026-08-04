import { DateTime } from "luxon";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getBookingByCancelToken } from "@/lib/db/bookings";
import {
  formatBookingDate,
  formatCancellationDeadline,
  formatDuration,
  formatPrice,
  formatSlotTime,
} from "@/lib/format";

/**
 * The URL contains a bearer secret, so this page is never indexed and never
 * described in metadata. `nofollow` too, unlike the booking page next door:
 * there is nothing here worth a crawler following, and the less this URL
 * circulates the better.
 */
export const metadata: Metadata = {
  title: "Booking confirmed",
  robots: { index: false, follow: false },
};

type PageProps = { params: Promise<{ slug: string; token: string }> };

export default async function BookedPage({ params }: PageProps) {
  const { slug, token } = await params;

  // The token is the authorization here — there is no session and no customer
  // account on this path (see getBookingByCancelToken). The slug is still
  // checked against the booking's own tenant so one shop's URL can never render
  // another shop's booking, and a bad token and a mismatched slug produce the
  // identical 404 rather than telling the difference apart.
  const booking = await getBookingByCancelToken(token);
  if (!booking || booking.tenant.slug !== slug) notFound();

  const { tenant, service } = booking;
  const date = DateTime.fromJSDate(booking.startAt)
    .setZone(tenant.timezone)
    .toISODate();

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 px-4 py-10 sm:py-16">
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-8">
        <header className="flex flex-col gap-2">
          {/* The one decorative element in the public flow, and it earns its
              place here: this is the only page whose job is to say an action
              succeeded, and a customer scanning it on a phone reads the tick
              before they read anything. aria-hidden because the <h1> below
              already says it in words — a screen reader gets the message once,
              not twice. Suppressed for a cancelled booking, where a green tick
              would be celebrating the wrong thing. */}
          {booking.status === "CANCELLED" ? null : (
            <span
              aria-hidden="true"
              className="mb-1 flex size-11 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"
            >
              <svg
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="size-5"
              >
                <path d="m4 10.5 4 4 8-9" />
              </svg>
            </span>
          )}
          <p className="text-sm font-medium text-zinc-500">{tenant.name}</p>
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">
            {booking.status === "CANCELLED"
              ? "This booking is cancelled"
              : "You're booked in"}
          </h1>
          <p className="text-zinc-600">
            {booking.status === "CANCELLED"
              ? "The appointment below is no longer reserved."
              : `Thanks, ${booking.customer.name.split(" ")[0]} — we've saved your spot.`}
          </p>
        </header>

        <dl className="flex flex-col gap-1.5 rounded-2xl border border-zinc-200 bg-white p-5 text-sm shadow-sm">
          <Row label="Service" value={service.name} />
          <Row label="Barber" value={booking.staff.name} />
          <Row
            label="When"
            value={
              date
                ? `${formatBookingDate(date, tenant.timezone)} at ${formatSlotTime(booking.startAt, tenant.timezone)}`
                : formatSlotTime(booking.startAt, tenant.timezone)
            }
          />
          <Row label="Duration" value={formatDuration(service.durationMinutes)} />
          <Row label="Price" value={formatPrice(service.priceMinorUnits)} />
        </dl>

        {booking.status === "CANCELLED" ? null : (
          <p className="text-sm text-zinc-500">
            Need to change something? You can{" "}
            <Link
              href={`/b/${slug}/cancel/${booking.cancelToken}`}
              className="font-medium text-zinc-900 underline underline-offset-4 hover:text-zinc-600"
            >
              cancel this booking
            </Link>{" "}
            {formatCancellationDeadline(tenant.cancellationWindowMinutes)} your
            appointment. The confirmation email carries the same link.
          </p>
        )}

        <Link
          href={`/b/${slug}`}
          className="inline-flex min-h-11 items-center self-start text-sm font-medium text-zinc-900 underline underline-offset-4 hover:text-zinc-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
        >
          Back to {tenant.name}
        </Link>
      </main>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-zinc-500">{label}</dt>
      <dd className="text-right font-medium text-zinc-900">{value}</dd>
    </div>
  );
}
