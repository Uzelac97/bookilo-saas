/**
 * Proves the `no_overlapping_bookings` exclusion constraint behaves in BOTH
 * directions — it rejects real overlaps and it permits genuine adjacency.
 *
 *   npm run probe:constraint
 *
 * Testing only the rejection case hides an off-by-one that would block every
 * consecutive booking, so this asserts six cases. See EXECUTION-PLAN.md day 3 and
 * the rationale block at the bottom of prisma/schema.prisma.
 *
 * All booking writes go through lib/db/bookings.ts createBooking(), so this
 * exercises the real path the Day 7 server action will use — including the
 * SQLSTATE 23P01 -> SLOT_TAKEN translation, which is otherwise unverified
 * guesswork about how Prisma surfaces the error.
 *
 * It writes real rows. Every one is prefixed `probe-` and belongs to a dedicated
 * throwaway tenant that is deleted before and after the run.
 */
import { createBooking } from "../src/lib/db/bookings";
// The probe drives the app's own Prisma client rather than a second one: it needs
// direct reads and status flips that no helper exists for yet, and this file sits
// outside src/ so the no-restricted-imports rule does not apply — the same
// reasoning as prisma/seed.ts. One client also means one connection pool, which
// phase A's concurrency relies on.
import { prisma } from "../src/lib/db/prisma";

const TENANT_ID = "probe-tenant";
const TENANT_SLUG = "probe-exclusion";
const STAFF_A = "probe-staff-a";
const STAFF_B = "probe-staff-b";
const SERVICE_ID = "probe-service-30";
const SERVICE_MINUTES = 30;
const CUSTOMER_1 = "probe-customer-1";
const CUSTOMER_2 = "probe-customer-2";

const CONSTRAINT_NAME = "no_overlapping_bookings";

// Fixed instants so runs are deterministic. Each phase gets its own calendar day
// so phases can never collide with each other's rows.
function at(day: number, hour: number, minute = 0): Date {
  return new Date(Date.UTC(2030, 0, day, hour, minute, 0, 0));
}

/**
 * How many check() calls a complete run makes: three "pre" guards on the
 * constraint definition, then one each for phases A to F.
 *
 * Asserted at the end, because "no failures" is also what a run prints when it
 * never reached half its phases. That matters more here than anywhere else — the
 * whole point of this probe is that the database, not the application, is the
 * authority on slot conflicts, and a truncated run that still says "all phases
 * passed" is exactly the evidence someone would build availability logic on.
 *
 * Every check() here is unconditional and outside any loop, so this is a fixed
 * number, and it has to move when a check is added or removed. Excludes the
 * count check itself.
 */
const EXPECTED_CHECKS = 9;

let checksRun = 0;
let failures = 0;

function check(phase: string, passed: boolean, detail: string) {
  checksRun += 1;

  if (passed) {
    console.log(`  PASS  ${phase}  ${detail}`);
  } else {
    failures += 1;
    console.error(`  FAIL  ${phase}  ${detail}`);
  }
}

/** The last check: that every other check actually ran. */
function reportCheckCount() {
  if (checksRun === EXPECTED_CHECKS) {
    console.log(`\n  PASS  count  ${checksRun} of ${EXPECTED_CHECKS} checks ran`);
    return;
  }

  failures += 1;
  console.error(
    `\n  FAIL  count  ${checksRun} of ${EXPECTED_CHECKS} checks ran — a phase was skipped, removed, or exited early`,
  );
}

type Outcome = "created" | "SLOT_TAKEN";

async function book(
  staffId: string,
  startAt: Date,
  customerId = CUSTOMER_1,
): Promise<Outcome> {
  const result = await createBooking({
    tenantId: TENANT_ID,
    staffId,
    serviceId: SERVICE_ID,
    customerId,
    startAt,
  });
  return result.ok ? "created" : result.reason;
}

async function setBuffer(minutes: number) {
  await prisma.tenant.update({
    where: { id: TENANT_ID },
    data: { bufferMinutes: minutes },
  });
}

async function teardown() {
  // Bookings first: Booking -> Staff/Service/Customer are onDelete: Restrict, so
  // the cascade from Tenant cannot be relied on to remove them in a safe order.
  await prisma.booking.deleteMany({ where: { tenantId: TENANT_ID } });
  await prisma.tenant.deleteMany({ where: { id: TENANT_ID } });
}

async function setup() {
  await prisma.tenant.create({
    data: {
      id: TENANT_ID,
      slug: TENANT_SLUG,
      name: "Probe Tenant (throwaway)",
      timezone: "Europe/Berlin",
      contactEmail: "probe@invalid.test",
      bufferMinutes: 0,
      staff: {
        create: [
          { id: STAFF_A, name: "Probe Staff A" },
          { id: STAFF_B, name: "Probe Staff B" },
        ],
      },
      services: {
        create: [
          {
            id: SERVICE_ID,
            name: "Probe service",
            durationMinutes: SERVICE_MINUTES,
            priceMinorUnits: 1000,
          },
        ],
      },
      customers: {
        create: [
          { id: CUSTOMER_1, name: "Probe Customer 1", phone: "+10000000001" },
          { id: CUSTOMER_2, name: "Probe Customer 2", phone: "+10000000002" },
        ],
      },
    },
  });
}

/**
 * A probe that cannot tell a missing constraint from a satisfied one is worse
 * than no probe: every phase would report PASS against an unprotected table.
 */
async function assertConstraintInstalled() {
  const rows = await prisma.$queryRaw<Array<{ def: string }>>`
    SELECT pg_get_constraintdef(oid) AS def
    FROM pg_constraint
    WHERE conname = ${CONSTRAINT_NAME}`;

  if (rows.length === 0) {
    throw new Error(
      `Constraint "${CONSTRAINT_NAME}" is not installed on this database. ` +
        `Run \`npx prisma migrate dev\`. Never \`prisma db push\` — it drops this constraint as drift.`,
    );
  }

  const def = rows[0].def;
  console.log(`Constraint installed:\n  ${def}\n`);

  // Cheap guards against a migration that was edited into something subtly wrong.
  check(
    "pre",
    def.includes("blockedUntil"),
    "range is over blockedUntil (not endAt), so buffer is enforced under concurrency",
  );
  check(
    "pre",
    def.includes("COMPLETED"),
    "WHERE clause covers COMPLETED, so completing a booking does not reopen its slot",
  );
  check("pre", def.includes("staffId"), "keyed by staffId");
}

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to run: NODE_ENV=production. This script writes rows.");
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is not set.");
  const { host, pathname } = new URL(databaseUrl);
  console.log(`Probing ${host}${pathname}\n`);

  await assertConstraintInstalled();
  await teardown();
  await setup();

  // --- A: concurrent overlapping bookings, same staff -> exactly one survives.
  // Each createBooking runs as its own implicit transaction on its own pooled
  // connection, so the second insert genuinely blocks on the first and then
  // fails. This is the production race, and it also verifies isSlotTakenError:
  // if the matcher is wrong this phase throws a raw Prisma error instead.
  const concurrent = await Promise.all([
    book(STAFF_A, at(7, 10, 0), CUSTOMER_1),
    book(STAFF_A, at(7, 10, 15), CUSTOMER_2),
  ]);
  const created = concurrent.filter((o) => o === "created").length;
  const rejected = concurrent.filter((o) => o === "SLOT_TAKEN").length;
  check(
    "A",
    created === 1 && rejected === 1,
    `overlap 10:00-10:30 vs 10:15-10:45, fired concurrently -> expected 1 created + 1 SLOT_TAKEN, got ${created} created + ${rejected} SLOT_TAKEN`,
  );

  // --- B: genuine adjacency with buffer 0 -> both legal (tsrange is half-open).
  const b1 = await book(STAFF_A, at(8, 10, 0));
  const b2 = await book(STAFF_A, at(8, 10, 30));
  check(
    "B",
    b1 === "created" && b2 === "created",
    `back-to-back 10:00-10:30 then 10:30-11:00, buffer 0 -> expected both created, got ${b1} + ${b2}`,
  );

  // --- C: same adjacency with buffer 15 -> second rejected, proving the range is
  // over blockedUntil rather than endAt.
  await setBuffer(15);
  const c1 = await book(STAFF_A, at(9, 10, 0));
  const c2 = await book(STAFF_A, at(9, 10, 30));
  check(
    "C",
    c1 === "created" && c2 === "SLOT_TAKEN",
    `same adjacency, buffer 15 (blocks to 10:45) -> expected created + SLOT_TAKEN, got ${c1} + ${c2}`,
  );
  await setBuffer(0);

  // --- D: same slot, different staff -> no collision across the shop.
  const d1 = await book(STAFF_A, at(10, 10, 0));
  const d2 = await book(STAFF_B, at(10, 10, 0));
  check(
    "D",
    d1 === "created" && d2 === "created",
    `identical slot, different staff -> expected both created, got ${d1} + ${d2}`,
  );

  // --- E: cancelling frees the slot (the WHERE clause must exclude CANCELLED).
  const eFirst = await createBooking({
    tenantId: TENANT_ID,
    staffId: STAFF_A,
    serviceId: SERVICE_ID,
    customerId: CUSTOMER_1,
    startAt: at(11, 10, 0),
  });
  if (!eFirst.ok) throw new Error("Phase E setup failed: first booking not created.");
  // A real cancel helper lands on Day 8; a direct status flip is enough here.
  await prisma.booking.update({
    where: { id: eFirst.booking.id },
    data: { status: "CANCELLED" },
  });
  const eRebook = await book(STAFF_A, at(11, 10, 0), CUSTOMER_2);
  check(
    "E",
    eRebook === "created",
    `rebook a CANCELLED booking's slot -> expected created, got ${eRebook}`,
  );

  // --- F: COMPLETED must keep occupying the slot.
  const fFirst = await createBooking({
    tenantId: TENANT_ID,
    staffId: STAFF_B,
    serviceId: SERVICE_ID,
    customerId: CUSTOMER_1,
    startAt: at(12, 10, 0),
  });
  if (!fFirst.ok) throw new Error("Phase F setup failed: first booking not created.");
  await prisma.booking.update({
    where: { id: fFirst.booking.id },
    data: { status: "COMPLETED" },
  });
  const fRebook = await book(STAFF_B, at(12, 10, 0), CUSTOMER_2);
  check(
    "F",
    fRebook === "SLOT_TAKEN",
    `rebook a COMPLETED booking's slot -> expected SLOT_TAKEN, got ${fRebook}`,
  );

  reportCheckCount();

  console.log(
    failures === 0
      ? "\nAll phases passed. The database is the authority on slot conflicts."
      : `\n${failures} check(s) FAILED. Do not build availability logic on top of this.`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    failures += 1;
  })
  .finally(async () => {
    await teardown();
    await prisma.$disconnect();
    process.exitCode = failures === 0 ? 0 : 1;
  });
