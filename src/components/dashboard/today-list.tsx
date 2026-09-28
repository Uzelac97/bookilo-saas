import Link from "next/link";

import { STATUS_LABELS } from "@/lib/dashboard/booking-status";
import type { DashboardBooking } from "@/lib/db/bookings";
import type { Translator } from "@/lib/i18n/translate";
import { formatPrice, formatSlotTime, formatTimeRange } from "@/lib/format";
import { getDashboardT } from "@/lib/i18n/server";
import { serviceName } from "@/lib/i18n/service-text";
import type { Locale } from "@/lib/preferences";
import { getLocale } from "@/lib/preferences-server";

/**
 * How each status is badged here. The words are shared with the calendar via
 * STATUS_LABELS; the styling is not, because a pill in a full-width row and a
 * tint on a calendar block want different treatments.
 */
const STATUS_BADGE_STYLES: Record<DashboardBooking["status"], string> = {
  CONFIRMED: "",
  CANCELLED: "border-line bg-subtle text-fg-muted",
  COMPLETED: "border-success-line bg-success-soft text-success-secondary",
  NO_SHOW: "border-warning-line-soft bg-warning-muted text-warning-secondary",
};

/**
 * Today's appointments for one shop.
 *
 * Read-only. The statuses render because the data has them; nothing in the
 * dashboard can set them — see "No status actions from the dashboard" in
 * EXECUTION-PLAN.md.
 *
 * `now` is passed in rather than read here so the whole page renders against one
 * instant: a component that called new Date() itself could classify a booking as
 * past in the summary and upcoming in the list, on the same screen.
 */
export async function TodayList({
  bookings,
  timezone,
  now,
}: {
  bookings: DashboardBooking[];
  timezone: string;
  now: Date;
}) {
  if (bookings.length === 0) return null;

  const [t, locale] = await Promise.all([getDashboardT(), getLocale()]);

  return (
    <ul className="flex flex-col gap-2">
      {bookings.map((booking) => (
        <BookingRow
          key={booking.id}
          booking={booking}
          timezone={timezone}
          now={now}
          t={t}
          locale={locale}
        />
      ))}
    </ul>
  );
}

function BookingRow({
  booking,
  timezone,
  now,
  t,
  locale,
}: {
  booking: DashboardBooking;
  timezone: string;
  now: Date;
  t: Translator;
  locale: Locale;
}) {
  const cancelled = booking.status === "CANCELLED";
  // Past by end time, not start: an appointment in progress is still today's
  // business and shouldn't grey out the moment it begins.
  const past = booking.endAt.getTime() <= now.getTime();
  const statusLabel = STATUS_LABELS[booking.status];

  return (
    <li
      className={[
        "rounded-2xl border border-line bg-surface p-4 transition-opacity",
        past || cancelled ? "opacity-55" : "",
      ].join(" ")}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span
          className={[
            "font-mono text-sm text-fg",
            cancelled ? "line-through" : "",
          ].join(" ")}
        >
          {formatTimeRange(booking.startAt, booking.endAt, timezone)}
        </span>

        <span className="text-sm text-fg-muted">{booking.staff.name}</span>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
        <span
          className={[
            "font-medium text-fg",
            cancelled ? "line-through" : "",
          ].join(" ")}
        >
          {booking.customer.name}
        </span>

        {statusLabel ? (
          <span
            className={`rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_BADGE_STYLES[booking.status]}`}
          >
            {t(statusLabel)}
          </span>
        ) : null}

        {booking.source === "MANUAL" ? (
          <span className="rounded-full border border-line bg-canvas px-2 py-0.5 text-xs font-medium text-fg-tertiary">
            {t("dashboard.walkIn")}
          </span>
        ) : null}
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-fg-tertiary">
        <span className={cancelled ? "line-through" : ""}>
          {serviceName(booking.service, locale)}
        </span>
        <span aria-hidden="true" className="text-fg-disabled">
          ·
        </span>
        {/* Strip spaces for the dial target only — the visible number keeps the
            formatting the customer typed. */}
        <a
          href={`tel:${booking.customer.phone.replace(/\s+/g, "")}`}
          className="font-medium text-fg underline-offset-4 hover:underline"
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
export async function TodaySummary({
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
  const t = await getDashboardT();

  return (
    <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-2xl border border-line bg-subtle-strong">
      <SummaryCell
        label={t("summary.booked")}
        value={String(booked)}
        detail={t("summary.appointments", { count: booked })}
      />
      <SummaryCell
        label={t("summary.next")}
        value={next ? formatSlotTime(next.startAt, timezone) : "—"}
        detail={next ? next.customer.name : t("summary.nothingLeftToday")}
      />
      <SummaryCell
        label={t("summary.bookedValue")}
        value={formatPrice(revenueMinorUnits)}
        detail={t("summary.exclNoShows")}
      />
    </dl>
  );
}

/**
 * One figure in a summary panel.
 *
 * Exported for the calendar's sidebar, which shows the same three numbers for
 * whatever range is on screen. Only the cell is shared, not TodaySummary itself:
 * that one is grid-cols-3 and says "today" in its copy, and a sidebar is neither
 * a row nor necessarily today.
 */
export function SummaryCell({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  // Label and detail wrap rather than truncate. In the three-up row a cell is
  // ~81px wide at a 375px viewport, and German runs long: "ohne
  // Nichterscheinen" was ellipsised to nothing useful. Plain wrapping isn't
  // enough on its own, because "Nichterscheinen" alone is wider than the cell,
  // so hyphens-auto breaks it at a real syllable (driven by <html lang>) and
  // wrap-break-word is the backstop that guarantees nothing overflows into the
  // neighbouring cell. The row's cells stretch to equal height, so a two-line
  // detail doesn't misalign the grid.
  //
  // The value shrinks below sm instead of wrapping: a figure is read at a
  // glance and shouldn't break across lines. The widest real value is a
  // four-figure day's revenue, "1.234,00 €" — about 96px at text-xl against an
  // ~81px cell at 375px, and it can't wrap at all, since Intl puts a no-break
  // space before the €. At text-base it's about 77px. The count and the "next"
  // time are far narrower. sm and up (including the calendar sidebar, which
  // only renders at 2xl) keep text-xl.
  return (
    <div className="flex flex-col gap-0.5 bg-surface p-4">
      <dt className="text-xs font-medium tracking-wide text-fg-muted uppercase hyphens-auto wrap-break-word">
        {label}
      </dt>
      <dd className="text-base font-semibold tracking-tight text-fg sm:text-xl">
        {value}
      </dd>
      <span className="text-xs text-fg-muted hyphens-auto wrap-break-word">
        {detail}
      </span>
    </div>
  );
}

/** Shown when nothing is on the books — the default view of a brand-new shop. */
export async function TodayEmptyState({ slug }: { slug: string }) {
  const t = await getDashboardT();

  return (
    <div className="rounded-2xl border border-dashed border-line-strong bg-surface p-8 text-center">
      <p className="font-medium text-fg">{t("today.emptyTitle")}</p>
      <p className="mt-1 text-sm text-fg-muted">
        {t("today.emptyBodyBefore")}{" "}
        <Link
          href={`/b/${slug}`}
          className="font-medium text-fg underline underline-offset-4"
        >
          {t("today.emptyBodyLink")}
        </Link>{" "}
        {t("today.emptyBodyAfter")}
      </p>
    </div>
  );
}
