import Link from "next/link";

import type { PublicService } from "@/lib/db/services";
import { formatDuration, formatPrice } from "@/lib/format";
import { getT } from "@/lib/i18n/server";
import { getLocale } from "@/lib/preferences-server";

type ServiceGroup = {
  /** null = the services with no category set. */
  category: string | null;
  services: PublicService[];
};

export async function ServiceList({
  services,
  slug,
}: {
  services: PublicService[];
  slug: string;
}) {
  const [t, locale] = await Promise.all([getT(), getLocale()]);

  if (services.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-line-strong px-4 py-8 text-center text-sm text-fg-muted">
        {t("shop.noServices")}
      </p>
    );
  }

  const groups = groupByCategory(services);
  // A single uncategorized group is just "the services" — heading it "Other"
  // would be noise. Categories only earn a heading once they distinguish
  // something.
  const showHeadings = groups.length > 1 || groups[0].category !== null;

  return (
    <div className="flex flex-col gap-8">
      {groups.map((group) => (
        <div key={group.category ?? "__uncategorized"}>
          {showHeadings ? (
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-fg-muted">
              {group.category ?? t("shop.otherCategory")}
            </h3>
          ) : null}

          <ul className="flex flex-col gap-3">
            {group.services.map((service) => (
              <li
                key={service.id}
                className="flex items-center justify-between gap-4 rounded-2xl border border-line bg-surface p-4 shadow-sm"
              >
                {/* min-w-0 is what lets the name truncate instead of pushing
                    the price and the button off a narrow screen. The row no
                    longer wraps: a wrapped button used to jump to its own line
                    at around 380px, which put a full-width black bar under
                    every service on a phone. */}
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate font-medium text-fg">
                    {service.name}
                  </span>
                  <span className="text-sm text-fg-muted">
                    {formatDuration(service.durationMinutes, locale)}
                  </span>
                </div>

                {/* Price out of the muted line and next to the button, because
                    it is the second thing anyone reads on a barbershop's menu
                    and the first thing they compare between two of them. */}
                <div className="flex shrink-0 items-center gap-3">
                  <span className="text-sm font-medium tabular-nums text-fg">
                    {formatPrice(service.priceMinorUnits)}
                  </span>
                  {/* min-h-11 is 44px, the smallest comfortable touch target.
                      This was py-2 on a text-sm line — about 36px — which is
                      the size it renders at on a phone, where every one of
                      these is tapped with a thumb. inline-flex, because a
                      min-height on an inline <a> does nothing. */}
                  <Link
                    href={`/b/${slug}/book?service=${service.id}`}
                    className="inline-flex min-h-11 items-center rounded-lg bg-primary px-4 text-sm font-medium text-on-primary transition-colors hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                  >
                    {t("shop.book")}
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/**
 * An order-preserving fold, not a sort: getActiveServices already returns rows
 * ordered by category (nulls last) then name, so every category arrives as one
 * contiguous run and re-sorting here would only be a second opinion that can
 * disagree.
 */
function groupByCategory(services: PublicService[]): ServiceGroup[] {
  const groups: ServiceGroup[] = [];

  for (const service of services) {
    const current = groups[groups.length - 1];

    if (current && current.category === service.category) {
      current.services.push(service);
      continue;
    }

    groups.push({ category: service.category, services: [service] });
  }

  return groups;
}
