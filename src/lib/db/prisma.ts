import { PrismaClient } from "@prisma/client";

// The Prisma client instance is private to src/lib/db/**. Everything outside
// this directory goes through the tenant-scoped helpers next to this file —
// see CLAUDE.md rule 1 and the no-restricted-imports rule in eslint.config.mjs.
//
// Cached on globalThis so Next.js dev HMR reuses one client instead of opening
// a new connection pool on every reload.

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
