import { PrismaClient } from "@prisma/client";

import { hashPassword } from "../src/lib/auth/password";

// This script instantiates PrismaClient directly, which is fine: the
// no-restricted-imports rule (CLAUDE.md rule 1) guards src/**, i.e. code that
// serves a request. A build-time seed has no tenant context to leak across.
const prisma = new PrismaClient();

const TENANT_SLUG = "demo-barbershop";

const OWNER_EMAIL = (process.env.SEED_OWNER_EMAIL ?? "owner@demo.test")
  .trim()
  .toLowerCase();
const OWNER_PASSWORD = process.env.SEED_OWNER_PASSWORD ?? "demo-password-123";

// Stable ids so re-running upserts the same rows instead of piling up
// duplicates — Staff and Service have no natural unique key in the schema.
const STAFF = [
  { id: "seed-staff-marco", name: "Marco Rossi" },
  { id: "seed-staff-ivan", name: "Ivan Novak" },
];

const SERVICES = [
  {
    id: "seed-service-haircut",
    name: "Haircut",
    durationMinutes: 30,
    priceMinorUnits: 2500,
    category: "Hair",
  },
  {
    id: "seed-service-beard",
    name: "Beard trim",
    durationMinutes: 20,
    priceMinorUnits: 1500,
    category: "Beard",
  },
  {
    id: "seed-service-combo",
    name: "Cut + beard",
    durationMinutes: 45,
    priceMinorUnits: 3500,
    category: "Hair",
  },
];

// dayOfWeek: 0 = Sunday .. 6 = Saturday. Minutes from midnight, tenant-local.
// Mon–Fri 09:00–18:00, Sat 09:00–14:00, closed Sunday — "closed" is simply the
// absence of hours, there is no business-level hours field.
const WEEKDAY_HOURS = [1, 2, 3, 4, 5].map((dayOfWeek) => ({
  dayOfWeek,
  startMinute: 9 * 60,
  endMinute: 18 * 60,
}));
const SATURDAY_HOURS = {
  dayOfWeek: 6,
  startMinute: 9 * 60,
  endMinute: 14 * 60,
};
const WORKING_HOURS = [...WEEKDAY_HOURS, SATURDAY_HOURS];

async function main() {
  const tenant = await prisma.tenant.upsert({
    where: { slug: TENANT_SLUG },
    update: {},
    create: {
      slug: TENANT_SLUG,
      name: "Demo Barbershop",
      timezone: "Europe/Berlin",
      address: "Kastanienallee 12, 10435 Berlin",
      contactEmail: OWNER_EMAIL,
      phone: "+49 30 1234567",
      // bufferMinutes / minLeadMinutes / cancellationWindowMinutes keep their
      // schema defaults (0 / 60 / 120). Day 12 wires the settings screen.
    },
  });

  const passwordHash = await hashPassword(OWNER_PASSWORD);
  const owner = await prisma.user.upsert({
    where: { email: OWNER_EMAIL },
    // Deliberately does NOT touch passwordHash on update — re-seeding must not
    // silently undo a password set via scripts/reset-password.ts.
    update: { tenantId: tenant.id },
    create: {
      tenantId: tenant.id,
      email: OWNER_EMAIL,
      passwordHash,
      role: "OWNER",
    },
  });

  for (const staff of STAFF) {
    await prisma.staff.upsert({
      where: { id: staff.id },
      update: { name: staff.name, active: true },
      create: { id: staff.id, tenantId: tenant.id, name: staff.name },
    });

    for (const hours of WORKING_HOURS) {
      const id = `seed-wh-${staff.id}-${hours.dayOfWeek}`;
      await prisma.workingHours.upsert({
        where: { id },
        update: hours,
        create: { id, staffId: staff.id, ...hours },
      });
    }
  }

  for (const service of SERVICES) {
    await prisma.service.upsert({
      where: { id: service.id },
      update: { ...service, active: true },
      create: { ...service, tenantId: tenant.id },
    });
  }

  console.log(`Seeded tenant "${tenant.name}" (/b/${tenant.slug})`);
  console.log(`  owner:    ${owner.email}`);
  console.log(`  staff:    ${STAFF.map((s) => s.name).join(", ")}`);
  console.log(`  services: ${SERVICES.map((s) => s.name).join(", ")}`);
  console.log(
    `\nPassword is only set when the owner row is first created. Use\n  npx tsx scripts/reset-password.ts ${owner.email}\nto change it.`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
