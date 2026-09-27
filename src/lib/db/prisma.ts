import { PrismaClient } from "@prisma/client";

// The Prisma client instance is private to src/lib/db/**. Everything outside
// this directory goes through the tenant-scoped helpers next to this file —
// see CLAUDE.md rule 1 and the no-restricted-imports rule in eslint.config.mjs.
//
// Cached on globalThis so Next.js dev HMR reuses one client instead of opening
// a new connection pool on every reload.

/**
 * Staff and Service are never hard-deleted — "removing" either is always
 * `active = false` (CLAUDE.md). Without this, that rule would be held up only
 * by the absence of a delete helper in lib/db/**: `Booking`'s
 * `onDelete: Restrict` blocks deleting a barber or service that has bookings,
 * but one that was never booked would delete cleanly, taking its working hours
 * and time off with it through the cascade.
 *
 * So the client itself refuses. This covers every Prisma-level delete of those
 * two models, from app code, the seed, and the probes alike. It deliberately
 * does not cover SQL-level cascades: deleting a whole Tenant still removes its
 * staff and services, which is what the probes' cleanup relies on and is a
 * different operation from removing one barber.
 *
 * A database trigger would be stricter, but it would fire on that tenant
 * cascade too, and it would be a migration for a rule no code path needs to
 * break.
 */
function refuseHardDelete(model: string, helper: string): never {
  throw new Error(
    `${model} rows are never hard-deleted. Set active = false with ${helper} in src/lib/db instead.`,
  );
}

function createClient() {
  return new PrismaClient().$extends({
    name: "no-hard-delete",
    query: {
      staff: {
        delete: () => refuseHardDelete("Staff", "setStaffActive"),
        deleteMany: () => refuseHardDelete("Staff", "setStaffActive"),
      },
      service: {
        delete: () => refuseHardDelete("Service", "setServiceActive"),
        deleteMany: () => refuseHardDelete("Service", "setServiceActive"),
      },
    },
  });
}

type ExtendedPrismaClient = ReturnType<typeof createClient>;

const globalForPrisma = globalThis as unknown as {
  prisma: ExtendedPrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
