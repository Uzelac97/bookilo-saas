import type { Metadata } from "next";
import Link from "next/link";

import { BookingRulesForm } from "@/components/dashboard/booking-rules-form";
import { getCurrentTenant } from "@/lib/auth/session";
import { BOOKING_HORIZON_DAYS } from "@/lib/availability/booking-options";
import { getDashboardT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDashboardT();
  return { title: t("nav.settings") };
}

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
  const [tenant, t] = await Promise.all([getCurrentTenant(), getDashboardT()]);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-fg">
          {t("nav.settings")}
        </h1>
        <p className="text-sm text-fg-muted">
          {t("settings.introBefore")}{" "}
          <Link
            href="/dashboard/staff"
            className="underline underline-offset-4 hover:text-fg"
          >
            {t("nav.staff")}
          </Link>{" "}
          {t("settings.introAfter")}
        </p>
      </header>

      <section className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-4 sm:p-6">
        <div className="flex flex-col gap-1">
          <h2 className="text-sm font-semibold tracking-tight text-fg">
            {t("settings.rulesHeading")}
          </h2>
          {/* Stated because it's the ceiling the minimum-notice field is measured
              against: notice longer than this leaves nothing bookable at all. */}
          <p className="text-sm text-fg-muted">
            {t("settings.horizon", {
              days: BOOKING_HORIZON_DAYS,
              timezone: tenant.timezone,
            })}
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

      <section className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-4 sm:p-6">
        <div className="flex flex-col gap-1">
          <h2 className="text-sm font-semibold tracking-tight text-fg">
            {t("settings.shopHeading")}
          </h2>
          <p className="text-sm text-fg-muted">
            {t("settings.shopNote")}
          </p>
        </div>

        <dl className="grid gap-4 text-sm sm:grid-cols-2">
          <Detail label={t("services.name")}>{tenant.name}</Detail>
          <Detail label={t("settings.bookingPage")}>
            <Link
              href={`/b/${tenant.slug}`}
              className="underline underline-offset-4 hover:text-fg"
            >
              /b/{tenant.slug}
            </Link>
          </Detail>
          <Detail label={t("settings.contactEmail")}>
            {tenant.contactEmail}
          </Detail>
          {/* The one line here that isn't just reference: every time this app
              shows is rendered in this zone, and so is every rule above. */}
          <Detail label={t("settings.timezone")}>{tenant.timezone}</Detail>
          {tenant.phone ? (
            <Detail label={t("book.phone")}>{tenant.phone}</Detail>
          ) : null}
          {tenant.address ? (
            <Detail label={t("settings.address")}>{tenant.address}</Detail>
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
      <dt className="text-fg-muted">{label}</dt>
      <dd className="text-fg">{children}</dd>
    </div>
  );
}
