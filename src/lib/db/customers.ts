import { Prisma } from "@prisma/client";

import { prisma } from "./prisma";

export type CustomerIdentity = {
  name: string;
  /**
   * Canonical form, as produced by lib/validation/phone.ts — digits, optional
   * leading `+`. Callers must pass a normalised value: this is the tenant's
   * identity key (`@@unique([tenantId, phone])`), so a raw "030 / 123" arriving
   * here silently creates a second customer for someone who already exists.
   */
  phone: string;
  email?: string | undefined;
};

/** Postgres unique-violation, as Prisma's typed error code. */
const UNIQUE_VIOLATION = "P2002";

/**
 * Resolves the Customer row a booking should point at, creating it on first
 * contact.
 *
 * Phone is the identity key *within a tenant* (`@@unique([tenantId, phone])`),
 * so the same number at two different shops is two customers — which is correct:
 * these are independent businesses that share no customer list.
 *
 * WHETHER A RETURNING CUSTOMER'S ROW IS REWRITTEN DEPENDS ON WHO IS ASKING, and
 * the caller must say so via `updateExisting`:
 *
 * - `false` on the public booking form. It is unauthenticated, and the phone
 *   number is the only identity check it has — a number anyone who has ever
 *   texted this person knows. Letting it rewrite `name`/`email` would let a
 *   stranger rename a customer across the owner's entire booking history (the
 *   dashboard reads the name live off this row) or swap in their own email
 *   address. So the public path creates on first contact and otherwise only
 *   links the new booking to the row as stored.
 * - `true` on the owner's manual booking form. That path is authenticated, and
 *   the owner correcting a typo in a customer's name is the point of it. `email`
 *   is still only written when one was supplied — it's optional on the form, and
 *   leaving it blank must not delete an address the shop already had.
 *
 * `notes` is never touched here on either path. That column belongs to the
 * owner's dashboard.
 */
export async function findOrCreateCustomer(
  tenantId: string,
  identity: CustomerIdentity,
  opts: { updateExisting: boolean },
): Promise<{ id: string }> {
  const { name, phone, email } = identity;

  const update = opts.updateExisting
    ? {
        name,
        // Spread, not `email: email ?? undefined` — Prisma treats an explicit
        // `undefined` as "no change" today, but writing the intent
        // structurally means this doesn't depend on that.
        ...(email ? { email } : {}),
      }
    : {};

  try {
    return await prisma.customer.upsert({
      where: { tenantId_phone: { tenantId, phone } },
      update,
      create: { tenantId, name, phone, ...(email ? { email } : {}) },
      select: { id: true },
    });
  } catch (error) {
    // Two concurrent first-time bookings from the same phone genuinely race
    // here: both upserts miss on the initial read, both attempt the insert, and
    // one loses on the unique index. That is a normal outcome for a shop where
    // someone books twice in quick succession, not a failure worth showing a
    // customer — so the loser re-reads the winner's row, applying the same
    // update the upsert would have (none at all on the public path).
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === UNIQUE_VIOLATION
    ) {
      return prisma.customer.update({
        where: { tenantId_phone: { tenantId, phone } },
        data: update,
        select: { id: true },
      });
    }

    throw error;
  }
}
