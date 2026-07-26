import { prisma } from "./prisma";

/**
 * A service as the public booking pages need it. Narrower than the Prisma model
 * on purpose — nothing outside lib/db/** should be handed columns it doesn't
 * render.
 */
export type PublicService = {
  id: string;
  name: string;
  durationMinutes: number;
  priceMinorUnits: number;
  category: string | null;
};

/**
 * The bookable services for one tenant, ordered for display.
 *
 * `active: true` is load-bearing, not cosmetic: there is no hard-delete for
 * Service (CLAUDE.md) — "removing" one always means active = false — so retired
 * rows are expected to exist and must never surface on a public page or in a
 * booking form.
 *
 * Ordering is category-then-name with nulls last, which means the uncategorized
 * services arrive as a contiguous run at the end. The grouping in
 * components/booking/service-list.tsx is then a single order-preserving fold
 * rather than a sort of its own.
 */
export async function getActiveServices(
  tenantId: string,
): Promise<PublicService[]> {
  return prisma.service.findMany({
    where: { tenantId, active: true },
    orderBy: [{ category: { sort: "asc", nulls: "last" } }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      durationMinutes: true,
      priceMinorUnits: true,
      category: true,
    },
  });
}
