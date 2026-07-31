/**
 * Proves getBookingRateForPhone counts the rows the per-phone rate limiter is
 * supposed to count — and, more importantly, does not count the ones it isn't.
 *
 *   npm run probe:rate-limit
 *
 * This exists because the two counts have deliberately different status filters
 * (see the doc comment on getBookingRateForPhone), and that asymmetry is the
 * kind of thing a plausible-looking "cleanup" collapses into one query. There is
 * no way to catch that in a unit test: the logic lives in a Prisma `where`, so
 * the only thing that can verify it is a database.
 *
 * Same shape and same rules as probe-exclusion-constraint.ts. It writes real
 * rows; every one is prefixed `probe-` and belongs to a dedicated throwaway
 * tenant that is deleted before and after the run.
 */
import { getBookingRateForPhone } from "../src/lib/db/bookings";
// Direct client use for the same reason as the sibling probe: this file sits
// outside src/, so the no-restricted-imports rule does not apply, and it needs
// status flips and fixed createdAt values that no helper exposes.
import { prisma } from "../src/lib/db/prisma";

const TENANT_ID = "probe-rate-tenant";
const OTHER_TENANT_ID = "probe-rate-tenant-other";
const STAFF_ID = "probe-rate-staff";
const SERVICE_ID = "probe-rate-service";
const CUSTOMER_ID = "probe-rate-customer";
const OTHER_CUSTOMER_ID = "probe-rate-customer-other";
const OTHER_TENANT_CUSTOMER_ID = "probe-rate-customer-cross";

/** The number under test, already in the canonical form the schema produces. */
const PHONE = "+10000000009";
/** A different customer at the same shop, to prove the count is per-phone. */
const OTHER_PHONE = "+10000000008";

const WINDOW_MINUTES = 60;

// A fixed "now" so nothing here depends on when it runs. Every instant below is
// expressed relative to it.
const NOW = new Date(Date.UTC(2030, 5, 10, 12, 0, 0, 0));

function minutesFromNow(minutes: number): Date {
  return new Date(NOW.getTime() + minutes * 60_000);
}

/**
 * How many check() calls a complete run makes — phases A to G, one each.
 *
 * Asserted at the end, because "no failures" is also what a run prints when it
 * never reached half its phases. `failures === 0` cannot tell a clean run from a
 * truncated one, and phases C and G are the two that keep the limiter from being
 * bypassable — "it passed" has to mean "all of it ran".
 *
 * Every check() here is unconditional and outside any loop, so this is a fixed
 * number, and it has to move when a check is added or removed. Excludes the
 * count check itself.
 */
const EXPECTED_CHECKS = 7;

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

/**
 * Inserts one booking directly.
 *
 * Deliberately NOT through createBooking, unlike the exclusion-constraint probe:
 * that helper stamps createdAt as the wall clock and refuses overlaps, and this
 * probe needs backdated rows and stacked times to describe the situations a rate
 * limiter cares about. The tenant boundary being bypassed here is the thing the
 * probe is measuring, not a rule it's dodging.
 */
async function booking(opts: {
  id: string;
  customerId: string;
  tenantId?: string;
  createdAt: Date;
  startAt: Date;
  status?: "CONFIRMED" | "CANCELLED" | "COMPLETED";
}) {
  const startAt = opts.startAt;
  const endAt = new Date(startAt.getTime() + 30 * 60_000);

  await prisma.booking.create({
    data: {
      id: opts.id,
      tenantId: opts.tenantId ?? TENANT_ID,
      staffId: STAFF_ID,
      serviceId: SERVICE_ID,
      customerId: opts.customerId,
      startAt,
      endAt,
      blockedUntil: endAt,
      status: opts.status ?? "CONFIRMED",
      source: "ONLINE",
      cancelToken: `probe-rate-token-${opts.id}`,
      createdAt: opts.createdAt,
    },
  });
}

async function teardown() {
  // Bookings first: Booking -> Staff/Service/Customer is onDelete: Restrict, so
  // the cascade from Tenant can't be relied on to remove them in a safe order.
  await prisma.booking.deleteMany({
    where: { tenantId: { in: [TENANT_ID, OTHER_TENANT_ID] } },
  });
  await prisma.tenant.deleteMany({
    where: { id: { in: [TENANT_ID, OTHER_TENANT_ID] } },
  });
}

async function setup() {
  await prisma.tenant.create({
    data: {
      id: TENANT_ID,
      slug: "probe-rate-limit",
      name: "Rate Probe Tenant (throwaway)",
      timezone: "Europe/Berlin",
      contactEmail: "probe@invalid.test",
      staff: { create: [{ id: STAFF_ID, name: "Probe Staff" }] },
      services: {
        create: [
          {
            id: SERVICE_ID,
            name: "Probe service",
            durationMinutes: 30,
            priceMinorUnits: 1000,
          },
        ],
      },
      customers: {
        create: [
          { id: CUSTOMER_ID, name: "Probe Customer", phone: PHONE },
          { id: OTHER_CUSTOMER_ID, name: "Other Customer", phone: OTHER_PHONE },
        ],
      },
    },
  });

  // A second shop with a customer on the *same* number — two independent
  // businesses that share no customer list, so one must not spend the other's
  // allowance. This is the tenancy half of the probe.
  await prisma.tenant.create({
    data: {
      id: OTHER_TENANT_ID,
      slug: "probe-rate-limit-other",
      name: "Other Rate Probe Tenant (throwaway)",
      timezone: "Europe/Berlin",
      contactEmail: "probe2@invalid.test",
      staff: { create: [{ id: `${STAFF_ID}-other`, name: "Other Staff" }] },
      services: {
        create: [
          {
            id: `${SERVICE_ID}-other`,
            name: "Probe service",
            durationMinutes: 30,
            priceMinorUnits: 1000,
          },
        ],
      },
      customers: {
        create: [
          {
            id: OTHER_TENANT_CUSTOMER_ID,
            name: "Same Number, Other Shop",
            phone: PHONE,
          },
        ],
      },
    },
  });
}

const rate = () =>
  getBookingRateForPhone(TENANT_ID, PHONE, {
    now: NOW,
    windowMinutes: WINDOW_MINUTES,
  });

async function main() {
  await teardown();
  await setup();

  try {
    console.log("\nPhase A — an unknown number starts at zero");
    {
      const { recent, upcoming } = await rate();
      check("A", recent === 0 && upcoming === 0, `recent=${recent} upcoming=${upcoming}`);
    }

    console.log("\nPhase B — a booking made just now counts, and holds a slot");
    await booking({
      id: "probe-rate-b1",
      customerId: CUSTOMER_ID,
      createdAt: minutesFromNow(-5),
      startAt: minutesFromNow(60 * 24),
    });
    {
      const { recent, upcoming } = await rate();
      check("B", recent === 1 && upcoming === 1, `recent=${recent} upcoming=${upcoming}`);
    }

    console.log("\nPhase C — cancelling still counts toward the window");
    // The bypass this asymmetry exists to close: book, cancel, repeat. If the
    // window forgave cancellations the limit would be worth nothing.
    await booking({
      id: "probe-rate-c1",
      customerId: CUSTOMER_ID,
      createdAt: minutesFromNow(-10),
      startAt: minutesFromNow(60 * 25),
      status: "CANCELLED",
    });
    {
      const { recent, upcoming } = await rate();
      check(
        "C",
        recent === 2 && upcoming === 1,
        `recent=${recent} (counts the cancellation) upcoming=${upcoming} (does not)`,
      );
    }

    console.log("\nPhase D — an older booking falls out of the window");
    await booking({
      id: "probe-rate-d1",
      customerId: CUSTOMER_ID,
      createdAt: minutesFromNow(-(WINDOW_MINUTES + 1)),
      startAt: minutesFromNow(60 * 26),
    });
    {
      const { recent, upcoming } = await rate();
      check(
        "D",
        recent === 2 && upcoming === 2,
        `recent=${recent} (window unchanged) upcoming=${upcoming} (still holds a slot)`,
      );
    }

    console.log("\nPhase E — a past appointment is not upcoming");
    await booking({
      id: "probe-rate-e1",
      customerId: CUSTOMER_ID,
      createdAt: minutesFromNow(-(WINDOW_MINUTES + 120)),
      startAt: minutesFromNow(-60),
      status: "COMPLETED",
    });
    {
      const { recent, upcoming } = await rate();
      check("E", recent === 2 && upcoming === 2, `recent=${recent} upcoming=${upcoming}`);
    }

    console.log("\nPhase F — another number at the same shop is not this one");
    await booking({
      id: "probe-rate-f1",
      customerId: OTHER_CUSTOMER_ID,
      createdAt: minutesFromNow(-1),
      startAt: minutesFromNow(60 * 27),
    });
    {
      const { recent, upcoming } = await rate();
      check("F", recent === 2 && upcoming === 2, `recent=${recent} upcoming=${upcoming}`);
    }

    console.log("\nPhase G — the same number at another shop is not this one");
    await booking({
      id: "probe-rate-g1",
      customerId: OTHER_TENANT_CUSTOMER_ID,
      tenantId: OTHER_TENANT_ID,
      createdAt: minutesFromNow(-1),
      startAt: minutesFromNow(60 * 28),
    });
    {
      const { recent, upcoming } = await rate();
      check(
        "G",
        recent === 2 && upcoming === 2,
        `recent=${recent} upcoming=${upcoming} — one shop cannot spend another's allowance`,
      );
    }
  } finally {
    await teardown();
    await prisma.$disconnect();
  }

  reportCheckCount();

  console.log(
    failures === 0
      ? "\nAll rate-limit counting checks passed.\n"
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
