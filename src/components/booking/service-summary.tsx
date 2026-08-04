import Link from "next/link";

import type { PublicService } from "@/lib/db/services";
import { formatDuration, formatPrice } from "@/lib/format";

/**
 * The chosen service, with a way back. Server-rendered — nothing here is
 * interactive, so it stays out of the client bundle.
 */
export function ServiceSummary({
  service,
  slug,
}: {
  service: PublicService;
  slug: string;
}) {
  return (
    // Laid out to match a row of the service list this was chosen from — same
    // card, same truncating name over a muted duration, same price sitting to
    // the right of the control. The customer should recognise the line they
    // tapped on the previous screen.
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate font-medium text-zinc-900">
          {service.name}
        </span>
        <span className="text-sm text-zinc-500">
          {formatDuration(service.durationMinutes)}
        </span>
      </div>

      <div className="flex shrink-0 items-center gap-3">
        <span className="text-sm font-medium tabular-nums text-zinc-900">
          {formatPrice(service.priceMinorUnits)}
        </span>
        <Link
          href={`/b/${slug}`}
          className="inline-flex min-h-11 items-center rounded-lg border border-zinc-200 px-4 text-sm font-medium text-zinc-700 transition-colors hover:border-zinc-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
        >
          Change
        </Link>
      </div>
    </div>
  );
}
