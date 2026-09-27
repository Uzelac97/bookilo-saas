import Link from "next/link";

import type { PublicService } from "@/lib/db/services";
import { formatDuration, formatPrice } from "@/lib/format";
import { getT } from "@/lib/i18n/server";
import { serviceName } from "@/lib/i18n/service-text";
import { getLocale } from "@/lib/preferences-server";
import type { Vertical } from "@/lib/vertical";

/**
 * The chosen service, with a way back. Server-rendered — nothing here is
 * interactive, so it stays out of the client bundle.
 */
export async function ServiceSummary({
  service,
  slug,
  vertical,
}: {
  service: PublicService;
  slug: string;
  vertical: Vertical;
}) {
  const [t, locale] = await Promise.all([getT(vertical), getLocale()]);

  return (
    // Laid out to match a row of the service list this was chosen from — same
    // card, same truncating name over a muted duration, same price sitting to
    // the right of the control. The customer should recognise the line they
    // tapped on the previous screen.
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-line bg-surface p-4 shadow-sm">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate font-medium text-fg">
          {serviceName(service, locale)}
        </span>
        <span className="text-sm text-fg-muted">
          {formatDuration(service.durationMinutes, locale)}
        </span>
      </div>

      <div className="flex shrink-0 items-center gap-3">
        <span className="text-sm font-medium tabular-nums text-fg">
          {formatPrice(service.priceMinorUnits)}
        </span>
        <Link
          href={`/b/${slug}`}
          className="inline-flex min-h-11 items-center rounded-lg border border-line px-4 text-sm font-medium text-fg-secondary transition-colors hover:border-line-stronger focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          {t("shop.changeService")}
        </Link>
      </div>
    </div>
  );
}
