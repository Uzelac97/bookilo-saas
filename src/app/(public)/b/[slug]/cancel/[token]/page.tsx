import { DateTime } from "luxon";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CancelButton } from "@/components/booking/cancel-button";
import { canCancel } from "@/lib/availability/cancellation";
import { getBookingByCancelToken } from "@/lib/db/bookings";
import {
  formatBookingDate,
  formatDuration,
  formatPrice,
  formatSlotTime,
} from "@/lib/format";

import { cancelBooking } from "./actions";

/** Same reasoning as the confirmation page: the URL carries a bearer secret. */
export const metadata: Metadata = {
  title: "Cancel booking",
  robots: { index: false, follow: false },
};

type PageProps = { params: Promise<{ slug: string; token: string }> };

/**
 * The cancel link from the confirmation email and the confirmation page.
 *
 * THIS PAGE MUST NEVER CANCEL ON LOAD. It is a GET on a URL that gets mailed to
 * people, and mail clients, antivirus scanners and link previewers all fetch
 * those URLs unprompted — a cancel-on-load link would cancel appointments by
 * itself, with the customer never having opened the mail. So the render is
 * read-only and the mutation is a POST behind a button.
 *
 * Everything below is derived from the booking's own row on every request. The
 * server action deliberately returns nothing, so this render is the single place
 * that decides what the customer is told.
 */
export default async function CancelPage({ params }: PageProps) {
  const { slug, token } = await params;

  // The token authorizes; the slug is checked against the booking's own tenant
  // so one shop's URL can never render another's booking. A bad token and a
  // mismatched slug produce the identical 404 — nothing distinguishes them.
  const booking = await getBookingByCancelToken(token);
  if (!booking || booking.tenant.slug !== slug) notFound();

  const { tenant, service } = booking;
  const date = DateTime.fromJSDate(booking.startAt)
    .setZone(tenant.timezone)
    .toISODate();

  const cancelled = booking.status === "CANCELLED";
  // COMPLETED or NO_SHOW — the appointment has already been and gone.
  const closed = !cancelled && booking.status !== "CONFIRMED";
  const inTime = canCancel({
    startAt: booking.startAt,
    now: new Date(),
    windowMinutes: tenant.cancellationWindowMinutes,
  });

  const reachTheShop = tenant.phone
    ? `call the shop on ${tenant.phone}`
    : "get in touch with the shop directly";

  /**
   * Why online cancellation is closed for this booking.
   *
   * Deliberately not formatCancellationDeadline: that renders the deadline a
   * customer still has ("up to 2 h before"), and this states the rule that has
   * already passed. But it needs the same care about a window of 0 — with no
   * window at all, cancellation stays open until the appointment starts, and
   * "closes 0 min before an appointment" tells the customer the exact opposite
   * of the setting. This branch is only reachable for a still-CONFIRMED booking
   * whose start has gone by, which is precisely when that sentence would be read.
   */
  const closedReason =
    tenant.cancellationWindowMinutes === 0
      ? "Online cancellation closes once an appointment starts, so this one is too late now."
      : `Online cancellation closes ${formatDuration(tenant.cancellationWindowMinutes)} before an appointment, so this one is too close now.`;

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 px-4 py-10 sm:py-16">
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-8">
        <header className="flex flex-col gap-2">
          <p className="text-sm font-medium text-zinc-500">{tenant.name}</p>
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">
            {cancelled ? "This booking is cancelled" : "Cancel your booking"}
          </h1>
          <p className="text-zinc-600">
            {cancelled
              ? "The appointment below is no longer reserved, and the time is back on the shop's calendar."
              : "Check the details below before you confirm."}
          </p>
        </header>

        <dl className="flex flex-col gap-1.5 rounded-2xl border border-zinc-200 bg-white p-5 text-sm">
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

        {cancelled ? null : closed ? (
          <Notice>
            This appointment can no longer be cancelled online. If something
            isn&rsquo;t right, {reachTheShop}.
          </Notice>
        ) : inTime ? (
          <form
            action={cancelBooking.bind(null, { slug, token })}
            className="flex flex-col gap-3"
          >
            <p className="text-sm text-zinc-600">
              This frees the time for someone else, and it can&rsquo;t be
              undone — you&rsquo;d need to book again.
            </p>
            <CancelButton />
          </form>
        ) : (
          <Notice>
            {/* The gaps between these expressions are explicit {" "} rather than
                plain spaces in the text. A literal space after a closing brace
                was silently dropped at build time here once already — it
                rendered as "closes 2 hbefore an appointment" — because a text
                node sandwiched between two expressions and wrapped across lines
                gets its leading space trimmed. An explicit space is a real
                child and can't be. */}
            {closedReason}{" "}
            If you can&rsquo;t make it, {reachTheShop} — they&rsquo;d rather
            know.
          </Notice>
        )}

        <Link
          href={`/b/${slug}`}
          className="self-start text-sm font-medium text-zinc-900 underline underline-offset-4 hover:text-zinc-600"
        >
          Back to {tenant.name}
        </Link>
      </main>
    </div>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      {children}
    </p>
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
