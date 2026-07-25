import { prisma } from "./prisma";

/**
 * Loads a tenant by its id. The caller must have obtained the id from the
 * server-side session (see lib/auth/session.ts) — never from client input.
 */
export async function getTenantById(tenantId: string) {
  return prisma.tenant.findUnique({
    where: { id: tenantId },
  });
}

/**
 * Public booking pages resolve their tenant from the URL slug on every request.
 * Used from Day 5 onward; kept here so both resolution paths live side by side.
 */
export async function getTenantBySlug(slug: string) {
  return prisma.tenant.findUnique({
    where: { slug },
  });
}
