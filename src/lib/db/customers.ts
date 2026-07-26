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
 * On a returning customer the stored `name` is overwritten with what they typed
 * this time. They know their own name, and it's the only path by which an
 * earlier typo ever gets corrected. `email` is different: it's optional on the
 * form, so it's only written when one was actually supplied — otherwise leaving
 * the field blank would silently delete an address the shop already had.
 *
 * `notes` is never touched here. That column belongs to the owner's dashboard,
 * and a public form must not be able to overwrite what a barber wrote about
 * someone.
 */
export async function findOrCreateCustomer(
  tenantId: string,
  identity: CustomerIdentity,
): Promise<{ id: string }> {
  const { name, phone, email } = identity;

  const update = {
    name,
    // Spread, not `email: email ?? undefined` — Prisma treats an explicit
    // `undefined` as "no change" today, but writing the intent structurally
    // means this doesn't depend on that.
    ...(email ? { email } : {}),
  };

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
    // customer — so the loser re-reads the winner's row.
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
