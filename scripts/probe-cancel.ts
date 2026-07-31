/**
 * Proves cancelBookingByToken makes the six status decisions it's supposed to,
 * and refuses the ones it isn't.
 *
 *   npm run probe:cancel
 *
 * This exists for the same reason as the sibling probes: the rules live in
 * Prisma calls and a conditional `updateMany`, so no unit test can reach them.
 * The pure part — whether an appointment is far enough out — is unit tested in
 * src/lib/availability/cancellation.test.ts. What's left is everything that
 * needs a row: which statuses may be rewritten, whether a second press is a
 * success or an error, and whether a refusal leaves the booking untouched.
 *
 * Phase E is the one worth keeping honest. A cancel token is a bearer secret
 * with no expiry, so it stays valid after the haircut has happened — a link
 * that could still flip a COMPLETED appointment to CANCELLED would let anyone
 * holding an old email rewrite the shop's history.
 *
 * It writes real rows. Every one is prefixed `probe-` and belongs to a
 * dedicated throwaway tenant that is deleted before and after the run.
 */
import { cancelBookingByToken } from "../src/lib/db/bookings";
// Direct client use, same reasoning as the sibling probes: this file sits
// outside src/, so the no-restricted-imports rule doesn't apply, and it needs
// to seed statuses and read them back, which no helper exposes.
import { prisma } from "../src/lib/db/prisma";

const TENANT_ID = "probe-cancel-tenant";
const CUSTOMER_ID = "probe-cancel-customer";
const SERVICE_ID = "probe-cancel-service";
const SERVICE_MINUTES = 30;

/** The tenant's cancellation window for this run, in minutes. */
const WINDOW = 120;

// A fixed instant, so the run is deterministic and phases can't drift across a
// real clock tick. Passed explicitly to cancelBookingByToken, which takes `now`
// as a parameter precisely so this is possible.
const NOW = new Date(Date.UTC(2030, 5, 10, 12, 0, 0, 0));

/** One barber per phase — see the note in makeBooking. */
const PHASES = ["a", "c", "d", "e"] as const;

/**
 * How many check() calls a complete run makes — phases A to F, one each.
 *
 * Asserted at the end, because "no failures" is also what a run prints when it
 * never reached half its phases. `failures === 0` cannot tell a clean run from a
 * truncated one, and phase E is the only thing standing between an old email and
 * a rewritten booking history — "it passed" has to mean "all of it ran".
 *
 * Every check() here is unconditional and outside any loop, so this is a fixed
 * number, and it has to move when a check is added or removed. Excludes the
 * count check itself.
 */
const EXPECTED_CHECKS = 6;

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

function minutesFromNow(minutes: number): Date {
  return new Date(NOW.getTime() + minutes * 60_000);
}

/**
 * Seeds one booking directly, at a chosen status.
 *
 * Not through createBooking, unlike the exclusion-constraint probe: that helper
 * only ever writes CONFIRMED rows with a generated token, and this probe needs
 * a COMPLETED one and predictable tokens to look up.
 *
 * Each phase gets its own barber. Phases C and D sit 119 and 120 minutes out by
 * design, which on a shared barber is a genuine 30-minute overlap that the
 * `no_overlapping_bookings` constraint rejects — correctly, and not what's
 * under test here.
 */
async function makeBooking(
  phase: (typeof PHASES)[number],
  startAt: Date,
  status: "CONFIRMED" | "COMPLETED" = "CONFIRMED",
): Promise<string> {
  const endAt = new Date(startAt.getTime() + SERVICE_MINUTES * 60_000);
  const cancelToken = `probe-cancel-token-${phase}`;

  await prisma.booking.create({
    data: {
      id: `probe-cancel-booking-${phase}`,
      tenantId: TENANT_ID,
      staffId: `probe-cancel-staff-${phase}`,
      serviceId: SERVICE_ID,
      customerId: CUSTOMER_ID,
      startAt,
      endAt,
      blockedUntil: endAt,
      status,
      cancelToken,
      createdAt: NOW,
    },
  });

  return cancelToken;
}

async function statusOf(cancelToken: string): Promise<string> {
  const booking = await prisma.booking.findUnique({
    where: { cancelToken },
    select: { status: true },
  });

  return booking?.status ?? "(gone)";
}

async function teardown() {
  // Bookings first: Booking -> Staff/Service/Customer is onDelete: Restrict, so
  // the cascade from Tenant can't be relied on to remove them in a safe order.
  await prisma.booking.deleteMany({ where: { tenantId: TENANT_ID } });
  await prisma.tenant.deleteMany({ where: { id: TENANT_ID } });
}

async function setup() {
  await prisma.tenant.create({
    data: {
      id: TENANT_ID,
      slug: "probe-cancel",
      name: "Cancel Probe Tenant (throwaway)",
      timezone: "Europe/Berlin",
      contactEmail: "probe@invalid.test",
      cancellationWindowMinutes: WINDOW,
      staff: {
        create: PHASES.map((phase) => ({
          id: `probe-cancel-staff-${phase}`,
          name: `Probe Staff ${phase.toUpperCase()}`,
        })),
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
          {
            id: CUSTOMER_ID,
            name: "Probe Customer",
            phone: "+10000000007",
          },
        ],
      },
    },
  });
}

async function main() {
  await teardown();
  await setup();

  try {
    console.log("\nPhase A — a booking well ahead of the window cancels");
    const a = await makeBooking("a", minutesFromNow(60 * 24));
    const resultA = await cancelBookingByToken(a, NOW);
    check(
      "A",
      resultA.ok && (await statusOf(a)) === "CANCELLED",
      `${JSON.stringify(resultA)} status=${await statusOf(a)}`,
    );

    console.log("\nPhase B — pressing cancel twice is idempotent, not an error");
    // The double-tap and the reloaded form. The conditional updateMany matches
    // nothing the second time, and that has to read as success: the customer
    // asked for this booking to be off the books and it is.
    const resultB = await cancelBookingByToken(a, NOW);
    check(
      "B",
      resultB.ok === true && (await statusOf(a)) === "CANCELLED",
      `${JSON.stringify(resultB)} status=${await statusOf(a)}`,
    );

    console.log("\nPhase C — inside the window it's refused and the row is untouched");
    const c = await makeBooking("c", minutesFromNow(WINDOW - 1));
    const resultC = await cancelBookingByToken(c, NOW);
    check(
      "C",
      !resultC.ok &&
        resultC.reason === "TOO_LATE" &&
        (await statusOf(c)) === "CONFIRMED",
      `${JSON.stringify(resultC)} status=${await statusOf(c)} (still holds its slot)`,
    );

    console.log("\nPhase D — exactly on the boundary still cancels");
    // "Cancel up to 2 hours before" is inclusive to the person reading it, so
    // the edge belongs to the customer. Mirrors the unit test in
    // src/lib/availability/cancellation.test.ts.
    const d = await makeBooking("d", minutesFromNow(WINDOW));
    const resultD = await cancelBookingByToken(d, NOW);
    check(
      "D",
      resultD.ok === true && (await statusOf(d)) === "CANCELLED",
      `${JSON.stringify(resultD)} status=${await statusOf(d)}`,
    );

    console.log("\nPhase E — a completed appointment can't be rewritten by a cancel link");
    const e = await makeBooking("e", minutesFromNow(-60 * 24), "COMPLETED");
    const resultE = await cancelBookingByToken(e, NOW);
    check(
      "E",
      !resultE.ok &&
        resultE.reason === "NOT_CANCELLABLE" &&
        (await statusOf(e)) === "COMPLETED",
      `${JSON.stringify(resultE)} status=${await statusOf(e)}`,
    );

    console.log("\nPhase F — an unknown token is NOT_FOUND, same as a wrong one");
    // Callers must not be able to tell "no such booking" from "not your token",
    // and nothing here may echo the token back.
    const resultF = await cancelBookingByToken("probe-cancel-token-nope", NOW);
    check("F", !resultF.ok && resultF.reason === "NOT_FOUND", JSON.stringify(resultF));
  } finally {
    await teardown();
    await prisma.$disconnect();
  }

  reportCheckCount();

  console.log(
    failures === 0
      ? "\nAll cancellation checks passed.\n"
      : `\n${failures} check(s) FAILED.\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (error) => {
  console.error(error);
  await teardown().catch(() => {});
  await prisma.$disconnect();
  process.exit(1);
});
