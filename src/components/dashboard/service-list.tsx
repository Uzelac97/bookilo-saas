import Link from "next/link";

import { setServiceActiveAction } from "@/app/(dashboard)/dashboard/services/actions";
import { ServiceForm } from "@/components/dashboard/service-form";
import type { ManagedService } from "@/lib/db/services";
import { formatDuration, formatPrice } from "@/lib/format";
import { getT } from "@/lib/i18n/server";
import type { Translator } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/preferences";
import { getLocale } from "@/lib/preferences-server";

/**
 * The owner's list of services, with the row being edited swapped for its form.
 *
 * Which row is open lives in the URL (`?edit=<id>`), not in client state — the
 * same convention the calendar page sets out for `date` and `view`. It survives
 * a refresh, it can be linked to, and it keeps this a server component with no
 * hydration to pay for.
 *
 * Retired services are listed, not hidden. There is no hard-delete for Service
 * (CLAUDE.md), so "retired" is a state an owner can be in by accident, and a
 * screen that hides those rows offers no way back out of it.
 */
export async function ServiceList({
  services,
  editingId,
}: {
  services: ManagedService[];
  editingId: string | undefined;
}) {
  const active = services.filter((service) => service.active);
  const retired = services.filter((service) => !service.active);
  const [t, locale] = await Promise.all([getT(), getLocale()]);

  return (
    <div className="flex flex-col gap-8">
      <Section
        title={t("services.bookable")}
        empty={t("services.bookableEmpty")}
        services={active}
        editingId={editingId}
        t={t}
        locale={locale}
      />

      {retired.length > 0 ? (
        <Section
          title={t("services.retired")}
          hint={t("services.retiredHint")}
          services={retired}
          editingId={editingId}
          t={t}
          locale={locale}
        />
      ) : null}
    </div>
  );
}

function Section({
  title,
  hint,
  empty,
  services,
  editingId,
  t,
  locale,
}: {
  title: string;
  hint?: string;
  empty?: string;
  services: ManagedService[];
  editingId: string | undefined;
  t: Translator;
  locale: Locale;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h2 className="text-sm font-semibold tracking-tight text-fg">
          {title}
        </h2>
        {hint ? <p className="text-sm text-fg-muted">{hint}</p> : null}
      </div>

      {services.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line-strong px-4 py-6 text-center text-sm text-fg-muted">
          {empty}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {services.map((service) => (
            <li
              key={service.id}
              className="rounded-2xl border border-line bg-surface p-4"
            >
              {service.id === editingId ? (
                <ServiceForm service={service} />
              ) : (
                <ServiceRow service={service} t={t} locale={locale} />
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ServiceRow({
  service,
  t,
  locale,
}: {
  service: ManagedService;
  t: Translator;
  locale: Locale;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
      <div className="flex min-w-0 flex-col gap-0.5">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span
            className={[
              "font-medium",
              service.active ? "text-fg" : "text-fg-muted",
            ].join(" ")}
          >
            {service.name}
          </span>
          {service.category ? (
            <span className="rounded-md bg-subtle px-1.5 py-0.5 text-xs font-medium text-fg-tertiary">
              {service.category}
            </span>
          ) : null}
        </div>
        <span className="text-sm text-fg-muted">
          {formatDuration(service.durationMinutes, locale)} ·{" "}
          {formatPrice(service.priceMinorUnits)}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <Link
          href={`/dashboard/services?edit=${service.id}`}
          className="rounded-lg border border-line-strong bg-surface px-3 py-1.5 text-sm font-medium text-fg-secondary transition-colors hover:bg-subtle"
        >
          {t("common.edit")}
        </Link>

        {/* "Retire" is always active = false, never a delete: Booking.serviceId
            is onDelete: Restrict, so a real delete would either fail or take the
            shop's history with it (CLAUDE.md). */}
        <form action={setServiceActiveAction}>
          <input type="hidden" name="serviceId" value={service.id} />
          <input
            type="hidden"
            name="active"
            value={service.active ? "false" : "true"}
          />
          <button
            type="submit"
            className="rounded-lg border border-line-strong bg-surface px-3 py-1.5 text-sm font-medium text-fg-secondary transition-colors hover:bg-subtle"
          >
            {service.active ? t("services.retire") : t("services.restore")}
          </button>
        </form>
      </div>
    </div>
  );
}
