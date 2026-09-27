import { DateTime } from "luxon";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getBookingByCancelToken } from "@/lib/db/bookings";
import {
  formatBookingDate,
  formatCancellationPolicy,
  formatDuration,
  formatPrice,
  formatSlotTime,
} from "@/lib/format";
import { getT } from "@/lib/i18n/server";
import { serviceName } from "@/lib/i18n/service-text";
import { getLocale } from "@/lib/preferences-server";

import { getShop } from "../../shop";

/**
 * The URL contains a bearer secret, so this page is never indexed and never
 * described in metadata. `nofollow` too, unlike the booking page next door:
 * there is nothing here worth a crawler following, and the less this URL
 * circulates the better.
 */
export async function generateMetadata(): Promise<Metadata> {
  // No tenant here: metadata never resolves the token (see above), and the
  // title is the same in every vertical.
  const t = await getT(null);
  return {
    title: t("booked.metaTitle"),
    robots: { index: false, follow: false },
  };
}

type PageProps = { params: Promise<{ slug: string; token: string }> };

export default async function BookedPage({ params }: PageProps) {
  const { slug, token } = await params;

  // The token is the authorization here — there is no session and no customer
  // account on this path (see getBookingByCancelToken). The slug is still
  // checked against the booking's own tenant so one shop's URL can never render
  // another shop's booking, and a bad token and a mismatched slug produce the
  // identical 404 rather than telling the difference apart.
  const booking = await getBookingByCancelToken(token, new Date());
  if (!booking || booking.tenant.slug !== slug) notFound();

  const { tenant, service } = booking;
  // The vertical comes from the slug's tenant, which the layout has already
  // resolved (a per-request memo hit, not a second query) and which the check
  // above has just proven is the booking's own.
  const shop = await getShop(slug);
  const [t, locale] = await Promise.all([
    getT(shop?.businessType ?? null),
    getLocale(),
  ]);
  const date = DateTime.fromJSDate(booking.startAt)
    .setZone(tenant.timezone)
    .toISODate();

  return (
    <div className="flex flex-1 flex-col bg-canvas px-4 py-10 sm:py-16">
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
              className="mb-1 flex size-11 items-center justify-center rounded-full bg-success-muted text-success-secondary"
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
          <p className="text-sm font-medium text-fg-muted">{tenant.name}</p>
          <h1 className="text-3xl font-semibold tracking-tight text-fg">
            {booking.status === "CANCELLED"
              ? t("booking.cancelledHeading")
              : t("booked.heading")}
          </h1>
          <p className="text-fg-tertiary">
            {booking.status === "CANCELLED"
              ? t("booked.cancelledBody")
              : t("booked.thanks", {
                  name: booking.customer.name.split(" ")[0],
                })}
          </p>
        </header>

        <dl className="flex flex-col gap-1.5 rounded-2xl border border-line bg-surface p-5 text-sm shadow-sm">
          <Row
            label={t("booking.service")}
            value={serviceName(service, locale)}
          />
          <Row label={t("booking.barber")} value={booking.staff.name} />
          <Row
            label={t("booking.when")}
            value={
              date
                ? t("booking.dateAtTime", {
                    date: formatBookingDate(date, tenant.timezone, locale),
                    time: formatSlotTime(booking.startAt, tenant.timezone),
                  })
                : formatSlotTime(booking.startAt, tenant.timezone)
            }
          />
          <Row
            label={t("booking.duration")}
            value={formatDuration(service.durationMinutes, locale)}
          />
          <Row
            label={t("booking.price")}
            value={formatPrice(service.priceMinorUnits)}
          />
        </dl>

        {booking.status === "CANCELLED" ? null : (
          <p className="text-sm text-fg-muted">
            {t("booked.changeIntro")}{" "}
            {formatCancellationPolicy(tenant.cancellationWindowMinutes, locale)}{" "}
            <Link
              href={`/b/${slug}/cancel/${booking.cancelToken}`}
              className="font-medium text-fg underline underline-offset-4 hover:text-fg-tertiary"
            >
              {t("booked.cancelLink")}
            </Link>{" "}
            {t("booked.emailHasLink")}
          </p>
        )}

        <Link
          href={`/b/${slug}`}
          className="inline-flex min-h-11 items-center self-start text-sm font-medium text-fg underline underline-offset-4 hover:text-fg-tertiary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          {t("booking.backTo", { shop: tenant.name })}
        </Link>
      </main>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-fg-muted">{label}</dt>
      <dd className="text-right font-medium text-fg">{value}</dd>
    </div>
  );
}
