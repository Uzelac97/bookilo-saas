import type { PublicService } from "@/lib/db/services";

export type ServiceGroup = {
  /** null = the services with no category set. */
  category: string | null;
  services: PublicService[];
};

/**
 * Services grouped under their category heading, for the public menus.
 *
 * An order-preserving fold, not a sort: getActiveServices already returns rows
 * ordered by category (nulls last) then name, so every category arrives as one
 * contiguous run and re-sorting here would only be a second opinion that can
 * disagree.
 */
export function groupByCategory(services: PublicService[]): ServiceGroup[] {
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
