import { DateTime } from "luxon";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";

import { BookingFlow } from "@/components/booking/booking-flow";
import { ServiceSummary } from "@/components/booking/service-summary";
import type { SlotGridEmptyReason } from "@/components/booking/slot-grid";
import {
  ANY_STAFF,
  canPageBack,
  canPageForward,
  dateStrip,
  mergeStaffSlots,
  resolveBookingDate,
  shiftByWeek,
} from "@/lib/availability/booking-options";
import { computeSlots } from "@/lib/availability/slots";
import { getStaffAvailability } from "@/lib/db/availability";
import { getActiveServices } from "@/lib/db/services";
import { getActiveStaff } from "@/lib/db/staff";
import { getTenantBySlug } from "@/lib/db/tenant";
import { formatBookingDate } from "@/lib/format";

/**
 * Same per-request memo as the business page next door: generateMetadata and the
 * page component both need the tenant, and React's cache() is what turns that
 * into one query instead of relying on Prisma's dataloader batching.
 */
const getShop = cache(async (slug: string) => getTenantBySlug(slug));

type PageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const tenant = await getShop(slug);

  if (!tenant) return { title: "Shop not found" };

  return {
    title: `Book · ${tenant.name}`,
    // A booking form is a transient, parameterised page — there is nothing here
    // for a search engine that the business page doesn't already say better.
    robots: { index: false, follow: true },
  };
}

/** searchParams values are `string | string[]`; a repeated key takes the first. */
function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function BookPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const query = await searchParams;

  // The public tenant-resolution path: slug from the URL, resolved server-side
  // on every request, never mixed with the session path (EXECUTION-PLAN.md §3).
  const tenant = await getShop(slug);
  if (!tenant) notFound();

  const [services, staff] = await Promise.all([
    getActiveServices(tenant.id),
    getActiveStaff(tenant.id),
  ]);

  // Redirect rather than 404: a bookmark for a since-retired service, or an id
  // belonging to another tenant entirely, should land the customer on the
  // business page where they can pick a real one. This is also what guarantees
  // a foreign serviceId never reaches computeSlots.
  const service = services.find((entry) => entry.id === first(query.service));
  if (!service) redirect(`/b/${slug}`);

  // One `now` for the whole render — reading the clock twice could straddle
  // midnight and produce a strip that disagrees with the date it resolved.
  const now = new Date();
  const date = resolveBookingDate(first(query.date), now, tenant.timezone);

  const requestedStaffId = first(query.staff);
  // An unknown or inactive staff id degrades to "any" rather than erroring —
  // same reasoning as clamping the date.
  const selectedStaffId =
    requestedStaffId && staff.some((member) => member.id === requestedStaffId)
      ? requestedStaffId
      : ANY_STAFF;

  const availability = await getStaffAvailability(tenant.id, {
    date,
    timezone: tenant.timezone,
    ...(selectedStaffId === ANY_STAFF ? {} : { staffId: selectedStaffId }),
  });

  const slots = mergeStaffSlots(
    computeSlots({
      date,
      serviceDurationMinutes: service.durationMinutes,
      rules: {
        timezone: tenant.timezone,
        bufferMinutes: tenant.bufferMinutes,
        minLeadMinutes: tenant.minLeadMinutes,
      },
      staff: availability,
      now,
    }),
  );

  // "Closed" and "fully booked" are different facts and read differently to a
  // customer. Nobody has working hours on this weekday means closed; hours that
  // exist but yield nothing means taken (or eaten by the lead time).
  const emptyReason: SlotGridEmptyReason = availability.some((member) =>
    member.workingHours.some(
      (row) => row.dayOfWeek === weekdayOf(date, tenant.timezone),
    ),
  )
    ? "FULLY_BOOKED"
    : "CLOSED";

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 px-4 py-10 sm:py-16">
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-8">
        <header className="flex flex-col gap-1">
          <p className="text-sm font-medium text-zinc-500">{tenant.name}</p>
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">
            Book an appointment
          </h1>
        </header>

        <ServiceSummary service={service} slug={slug} />

        <BookingFlow
          slug={slug}
          service={service}
          staff={staff}
          slots={slots}
          stripDays={dateStrip(date, now, tenant.timezone)}
          selectedDate={date}
          selectedStaffId={selectedStaffId}
          canGoBack={canPageBack(date, now, tenant.timezone)}
          canGoForward={canPageForward(date, now, tenant.timezone)}
          previousWeekDate={shiftByWeek(date, -1, now, tenant.timezone)}
          nextWeekDate={shiftByWeek(date, 1, now, tenant.timezone)}
          emptyReason={emptyReason}
          timezone={tenant.timezone}
        />

        <p className="text-center text-sm text-zinc-500">
          Showing times for {formatBookingDate(date, tenant.timezone)} in{" "}
          {tenant.name}&rsquo;s local time.
        </p>
      </main>
    </div>
  );
}

/**
 * schema.prisma's 0 = Sunday .. 6 = Saturday numbering, from a tenant-local
 * date. Luxon's `weekday` is 1 = Monday .. 7 = Sunday, so `% 7` reconciles them
 * — the same off-by-one computeSlots calls out.
 *
 * This is only used to tell "closed" apart from "fully booked" in the empty
 * state. It is not a second opinion on availability: computeSlots decides what's
 * bookable, and this never changes that.
 */
function weekdayOf(date: string, timezone: string): number {
  return DateTime.fromISO(date, { zone: timezone }).weekday % 7;
}
