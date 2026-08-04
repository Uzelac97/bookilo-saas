import type { Metadata } from "next";
import Link from "next/link";

import { BookingRulesForm } from "@/components/dashboard/booking-rules-form";
import { getCurrentTenant } from "@/lib/auth/session";
import { BOOKING_HORIZON_DAYS } from "@/lib/availability/booking-options";

export const metadata: Metadata = {
  title: "Settings",
};

/**
 * The shop's booking rules: gap between appointments, minimum notice,
 * cancellation window.
 *
 * These three and nothing else. Opening hours are per barber and live on the
 * Staff screen — there is no business-level hours field by design
 * (EXECUTION-PLAN.md). Name, address, timezone and the public URL are shown
 * read-only below, because the rules above are meaningless without knowing which
 * clock they're measured on, but editing them isn't in this screen's scope.
 *
 * The tenant comes from the session (CLAUDE.md rule 2), memoized per request by
 * getCurrentTenant, so reading it here costs nothing on top of the layout's read.
 */
export default async function SettingsPage() {
  const tenant = await getCurrentTenant();

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
          Settings
        </h1>
        <p className="text-sm text-zinc-500">
          How far ahead customers can book, and how much room you leave between
          appointments. Your opening hours are set per barber, on the{" "}
          <Link
            href="/dashboard/staff"
            className="underline underline-offset-4 hover:text-zinc-900"
          >
            Staff
          </Link>{" "}
          screen.
        </p>
      </header>

      <section className="flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-4 sm:p-6">
        <div className="flex flex-col gap-1">
          <h2 className="text-sm font-semibold tracking-tight text-zinc-900">
            Booking rules
          </h2>
          {/* Stated because it's the ceiling the minimum-notice field is measured
              against: notice longer than this leaves nothing bookable at all. */}
          <p className="text-sm text-zinc-500">
            Customers can book up to {BOOKING_HORIZON_DAYS} days ahead, in{" "}
            {tenant.timezone} time.
          </p>
        </div>
        <BookingRulesForm
          rules={{
            bufferMinutes: tenant.bufferMinutes,
            minLeadMinutes: tenant.minLeadMinutes,
            cancellationWindowMinutes: tenant.cancellationWindowMinutes,
          }}
        />
      </section>

      <section className="flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-4 sm:p-6">
        <div className="flex flex-col gap-1">
          <h2 className="text-sm font-semibold tracking-tight text-zinc-900">
            Your shop
          </h2>
          <p className="text-sm text-zinc-500">
            Not editable here yet — get in touch if any of this needs to change.
          </p>
        </div>

        <dl className="grid gap-4 text-sm sm:grid-cols-2">
          <Detail label="Name">{tenant.name}</Detail>
          <Detail label="Booking page">
            <Link
              href={`/b/${tenant.slug}`}
              className="underline underline-offset-4 hover:text-zinc-900"
            >
              /b/{tenant.slug}
            </Link>
          </Detail>
          <Detail label="Contact email">{tenant.contactEmail}</Detail>
          {/* The one line here that isn't just reference: every time this app
              shows is rendered in this zone, and so is every rule above. */}
          <Detail label="Timezone">{tenant.timezone}</Detail>
          {tenant.phone ? <Detail label="Phone">{tenant.phone}</Detail> : null}
          {tenant.address ? (
            <Detail label="Address">{tenant.address}</Detail>
          ) : null}
        </dl>
      </section>
    </div>
  );
}

/** One read-only label/value pair in the shop block. */
function Detail({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-zinc-500">{label}</dt>
      <dd className="text-zinc-900">{children}</dd>
    </div>
  );
}
