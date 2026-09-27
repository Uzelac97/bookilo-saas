import type { Metadata } from "next";
import Link from "next/link";

import { ManualBookingForm } from "@/components/dashboard/manual-booking-form";
import { getCurrentTenant } from "@/lib/auth/session";
import { resolveCalendarDate } from "@/lib/dashboard/calendar-range";
import { getStaffAvailability } from "@/lib/db/availability";
import { getActiveServices } from "@/lib/db/services";
import { getActiveStaff } from "@/lib/db/staff";
import { formatBookingDate } from "@/lib/format";
import { getDashboardT } from "@/lib/i18n/server";
import type { MessageKey } from "@/lib/i18n/translate";
import { getLocale } from "@/lib/preferences-server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDashboardT();
  return { title: t("dashboard.newBooking") };
}

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** searchParams values are `string | string[]`; a repeated key takes the first. */
function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Booking on the owner's behalf — a walk-in, or one taken over the phone.
 *
 * The tenant comes from the session (CLAUDE.md rule 2). `date` is the only piece
 * of state in the URL, because it's the only one that changes what the server
 * has to fetch; barber, service and time are held in the form. The other three
 * params exist for prefilling from the calendar and are read once.
 *
 * resolveCalendarDate, NOT resolveBookingDate — the booking flow's helper clamps
 * to [today, today + 30] because a customer can't book the past, and an owner
 * writing up this morning's walk-in very much can. The two look interchangeable
 * and aren't; lib/dashboard/calendar-range.ts opens with the same warning.
 *
 * Only *active* staff and services are offered. That isn't a policy choice made
 * here — createBooking refuses a deactivated barber or a retired service
 * outright, so offering one would produce a form that fails on submit.
 */
export default async function NewBookingPage({ searchParams }: PageProps) {
  const tenant = await getCurrentTenant();
  const query = await searchParams;
  const now = new Date();

  const date = resolveCalendarDate(first(query.date), now, tenant.timezone);

  const [staff, services, availability] = await Promise.all([
    getActiveStaff(tenant.id),
    getActiveServices(tenant.id),
    // Every active barber's day, not just the one selected: switching barber in
    // the form then needs no round trip, and this is a handful of rows either way.
    getStaffAvailability(tenant.id, { date, timezone: tenant.timezone }),
  ]);

  const missing = missingPrerequisite(staff.length, services.length);
  const [t, locale] = await Promise.all([getDashboardT(), getLocale()]);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-2">
        <Link
          href={`/dashboard/calendar?date=${date}`}
          className="w-fit text-sm text-fg-muted underline-offset-4 hover:text-fg hover:underline"
        >
          ← {t("nav.calendar")}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight text-fg">
          {t("dashboard.newBooking")}
        </h1>
        <p className="text-sm text-fg-muted">
          {t("manual.intro")}
        </p>
      </header>

      {missing ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-warning-line bg-warning-soft p-4 text-sm text-warning">
          <p>{t(missing.message)}</p>
          <Link
            href={missing.href}
            className="w-fit rounded-lg bg-warning-solid px-3 py-1.5 text-sm font-medium text-on-warning transition-colors hover:bg-warning-solid-hover"
          >
            {t(missing.action)}
          </Link>
        </div>
      ) : (
        <section className="flex flex-col gap-6 rounded-2xl border border-line bg-surface p-4 sm:p-6">
          <h2 className="text-sm font-semibold tracking-tight text-fg">
            {formatBookingDate(date, tenant.timezone, locale)}
          </h2>

          <ManualBookingForm
            staff={staff}
            services={services}
            availability={availability}
            rules={{
              timezone: tenant.timezone,
              bufferMinutes: tenant.bufferMinutes,
              // The tenant's real setting travels through so the warnings can
              // reason about it. suggestSlots is what waives it, and it says why.
              minLeadMinutes: tenant.minLeadMinutes,
            }}
            date={date}
            now={now}
            prefill={{
              staffId: first(query.staffId),
              serviceId: first(query.serviceId),
              time: first(query.time),
            }}
          />
        </section>
      )}
    </div>
  );
}

/**
 * What's stopping a booking from being possible at all.
 *
 * A form with an empty barber dropdown is a dead end that doesn't say why, and
 * on a fresh shop both of these are the expected state rather than an error.
 */
function missingPrerequisite(
  staffCount: number,
  serviceCount: number,
): { message: MessageKey; href: string; action: MessageKey } | null {
  if (staffCount === 0) {
    return {
      message: "manual.needStaff",
      href: "/dashboard/staff",
      action: "manual.goToStaff",
    };
  }

  if (serviceCount === 0) {
    return {
      message: "manual.needService",
      href: "/dashboard/services",
      action: "manual.goToServices",
    };
  }

  return null;
}
