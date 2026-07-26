import Link from "next/link";

import type { PublicService } from "@/lib/db/services";
import { formatDuration, formatPrice } from "@/lib/format";

type ServiceGroup = {
  /** null = the services with no category set. */
  category: string | null;
  services: PublicService[];
};

export function ServiceList({
  services,
  slug,
}: {
  services: PublicService[];
  slug: string;
}) {
  if (services.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-zinc-300 px-4 py-8 text-center text-sm text-zinc-500">
        No services listed yet.
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
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">
              {group.category ?? "Other"}
            </h3>
          ) : null}

          <ul className="flex flex-col gap-3">
            {group.services.map((service) => (
              <li
                key={service.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm"
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="font-medium text-zinc-900">
                    {service.name}
                  </span>
                  <span className="text-sm text-zinc-500">
                    {formatDuration(service.durationMinutes)} ·{" "}
                    {formatPrice(service.priceMinorUnits)}
                  </span>
                </div>

                <Link
                  href={`/b/${slug}/book?service=${service.id}`}
                  className="shrink-0 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800"
                >
                  Book
                </Link>
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
