import { cache } from "react";

import { getTenantBySlug } from "@/lib/db/tenant";

/**
 * The public tenant-resolution path: slug from the URL, resolved server-side on
 * every request, never mixed with the session path (CLAUDE.md rule 2).
 *
 * Shared by the segment's layout, which needs the tenant's vertical for the
 * client components' wording, and by the pages and their generateMetadata. All
 * of them ask for the same row in one request, and Next's automatic request
 * deduplication only covers fetch() — a Prisma call gets none of it. React's
 * cache() gives every caller after the first a per-request memo hit instead of
 * a second query.
 *
 * Measured, because the failure mode here is subtler than "two round trips":
 * without the wrapper both lookups really are issued, but Prisma's findUnique
 * dataloader coalesces them into one round trip
 * (`WHERE slug IN ($1,$2)` — the same slug twice) as long as they land in the
 * same tick. So this is not the difference between one query and two; it's the
 * difference between deduplicating explicitly and relying on that batching
 * heuristic to keep holding. With cache(): `WHERE slug = $1 LIMIT 1`, once.
 *
 * It lives here rather than in lib/db/tenant.ts on purpose — that layer is
 * plain async functions that also run from scripts and server actions, where a
 * React render scope doesn't exist. Framework machinery stays in the route tree.
 */
export const getShop = cache(async (slug: string) => getTenantBySlug(slug));
