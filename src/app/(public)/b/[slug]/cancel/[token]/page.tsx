import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { BookingSummary } from "@/components/booking/booking-summary";
import { CancelButton } from "@/components/booking/cancel-button";
import { canCancel } from "@/lib/availability/cancellation";
import { getBookingByCancelToken } from "@/lib/db/bookings";
import { formatDuration } from "@/lib/format";
import { getT } from "@/lib/i18n/server";
import { getLocale } from "@/lib/preferences-server";

import { getShop } from "../../shop";
import { cancelBooking } from "./actions";

/** Same reasoning as the confirmation page: the URL carries a bearer secret. */
export async function generateMetadata(): Promise<Metadata> {
  // No tenant here: metadata never resolves the token (see above), and the
  // title is the same in every vertical.
  const t = await getT(null);
  return {
    title: t("cancel.metaTitle"),
    robots: { index: false, follow: false },
  };
}

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
  const booking = await getBookingByCancelToken(token, new Date());
  if (!booking || booking.tenant.slug !== slug) notFound();

  const { tenant } = booking;
  // The vertical comes from the slug's tenant, which the layout has already
  // resolved (a per-request memo hit, not a second query) and which the check
  // above has just proven is the booking's own.
  const shop = await getShop(slug);
  const [t, locale] = await Promise.all([
    getT(shop?.businessType ?? null),
    getLocale(),
  ]);

  const cancelled = booking.status === "CANCELLED";
  // COMPLETED or NO_SHOW — the appointment has already been and gone.
  const closed = !cancelled && booking.status !== "CONFIRMED";
  const inTime = canCancel({
    startAt: booking.startAt,
    now: new Date(),
    windowMinutes: tenant.cancellationWindowMinutes,
  });

  // Whole sentences per case rather than a "call the shop" fragment spliced
  // into English around it: German puts the separable verb at the end ("ruf
  // … an"), so the fragment cannot be translated on its own.
  const phone = tenant.phone;
  const closedNotice = phone
    ? t("cancel.closedNoticePhone", { phone })
    : t("cancel.closedNotice");
  const tooLateContact = phone
    ? t("cancel.tooLateContactPhone", { phone })
    : t("cancel.tooLateContact");

  /**
   * Why online cancellation is closed for this booking.
   *
   * Deliberately not formatCancellationPolicy: that renders the deadline a
   * customer still has ("up to 2 h before"), and this states the rule that has
   * already passed. But it needs the same care about a window of 0 — with no
   * window at all, cancellation stays open until the appointment starts, and
   * "closes 0 min before an appointment" tells the customer the exact opposite
   * of the setting. This branch is only reachable for a still-CONFIRMED booking
   * whose start has gone by, which is precisely when that sentence would be read.
   */
  const closedReason =
    tenant.cancellationWindowMinutes === 0
      ? t("cancel.closedReasonAtStart")
      : t("cancel.closedReasonWindow", {
          duration: formatDuration(tenant.cancellationWindowMinutes, locale),
        });

  return (
    <div className="flex flex-1 flex-col bg-canvas px-4 py-10 sm:py-16">
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-8">
        <header className="flex flex-col gap-2">
          <p className="text-sm font-medium text-fg-muted">{tenant.name}</p>
          <h1 className="text-3xl font-semibold tracking-tight text-fg">
            {cancelled ? t("booking.cancelledHeading") : t("cancel.heading")}
          </h1>
          <p className="text-fg-tertiary">
            {cancelled ? t("cancel.cancelledBody") : t("cancel.intro")}
          </p>
        </header>

        <BookingSummary booking={booking} t={t} locale={locale} />

        {cancelled ? null : closed ? (
          <Notice>{closedNotice}</Notice>
        ) : inTime ? (
          <form
            action={cancelBooking.bind(null, { slug, token })}
            className="flex flex-col gap-3"
          >
            <p className="text-sm text-fg-tertiary">
              {t("cancel.warning")}
            </p>
            <CancelButton />
          </form>
        ) : (
          <Notice>
            {/* Explicit {" "} between expressions, never a literal space: a text
                node sandwiched between two expressions and wrapped across lines
                has its leading space trimmed at build time (see CLAUDE.md). */}
            {closedReason}{" "}
            {tooLateContact}
          </Notice>
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

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border border-warning-line bg-warning-soft px-4 py-3 text-sm text-warning">
      {children}
    </p>
  );
}
