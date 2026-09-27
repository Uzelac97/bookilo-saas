/**
 * The business verticals, as a plain type the client can import.
 *
 * The source of truth is the `BusinessType` enum in prisma/schema.prisma, but
 * `@prisma/client` may only be imported under lib/db/** (CLAUDE.md), and the
 * translator that consumes this runs in client components. So the union is
 * restated here, and lib/db/tenant.ts pins it to Prisma's enum with a
 * compile-time equality check — adding a value to one and not the other is a
 * `tsc` error, not a missing label.
 *
 * A vertical changes wording and demo data only, never structure
 * (EXECUTION-PLAN.md, "which industries this product serves").
 */
export type Vertical = "BARBERSHOP" | "SALON";
