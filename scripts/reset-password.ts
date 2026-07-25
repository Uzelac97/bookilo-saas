/**
 * Manual password reset for an owner account.
 *
 *   npx tsx scripts/reset-password.ts <email> [newPassword]
 *
 * There is no in-app password reset flow in the MVP — that's a deliberate scope
 * cut, not an oversight. This exists so a forgotten password can't kill a live
 * customer trial. It lives outside src/ so the app can never import it.
 */
import { randomBytes } from "node:crypto";

import { PrismaClient } from "@prisma/client";

import { hashPassword } from "../src/lib/auth/password";

const prisma = new PrismaClient();

function generatePassword(): string {
  // base64url of 12 bytes → 16 chars, no ambiguous separators to mistype.
  return randomBytes(12).toString("base64url");
}

async function main() {
  const [emailArg, passwordArg] = process.argv.slice(2);

  if (!emailArg) {
    console.error(
      "Usage: npx tsx scripts/reset-password.ts <email> [newPassword]",
    );
    process.exitCode = 1;
    return;
  }

  const email = emailArg.trim().toLowerCase();
  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true, tenant: { select: { name: true, slug: true } } },
  });

  if (!existing) {
    console.error(`No user found with email "${email}".`);
    process.exitCode = 1;
    return;
  }

  const password = passwordArg ?? generatePassword();
  const passwordHash = await hashPassword(password);

  await prisma.user.update({
    where: { id: existing.id },
    data: { passwordHash },
  });

  console.log(`Password updated for ${email}`);
  console.log(`  tenant: ${existing.tenant.name} (/b/${existing.tenant.slug})`);

  if (!passwordArg) {
    console.log(`\n  New password: ${password}`);
    console.log("  Copy it now — it isn't stored anywhere in plaintext.");
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
