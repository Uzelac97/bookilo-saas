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
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="font-medium text-zinc-900">{service.name}</span>
        <span className="text-sm text-zinc-500">
          {formatDuration(service.durationMinutes)} ·{" "}
          {formatPrice(service.priceMinorUnits)}
        </span>
      </div>

      <Link
        href={`/b/${slug}`}
        className="shrink-0 rounded-lg border border-zinc-200 px-3.5 py-2 text-sm font-medium text-zinc-700 transition-colors hover:border-zinc-400"
      >
        Change
      </Link>
    </div>
  );
}
