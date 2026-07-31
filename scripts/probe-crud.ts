/**
 * Proves the Day 11 write helpers keep the tenant boundary, and that "remove"
 * never means delete.
 *
 *   npm run probe:crud
 *
 * Same reason as the sibling probes: these rules live in the shape of a Prisma
 * call — a compound `where` on `updateMany`, and a re-fetch before a
 * `deleteMany` — and no unit test can reach them. What's tested here is
 * precisely what a test double would paper over.
 *
 * PHASE C IS THE ONE THAT MATTERS. `WorkingHours` has no `tenantId` column; its
 * only tenant scope is the `staffId` it hangs off. So `replaceWorkingHours`
 * cannot state the boundary in its `where` clause the way every other write in
 * lib/db/** does, and has to re-fetch the staff row scoped by tenant instead. If
 * that check is ever dropped, one shop will be able to wipe another's opening
 * hours — and nothing else in this repo would notice.
 *
 * It writes real rows. Every one belongs to one of two dedicated throwaway
 * tenants that are deleted before and after the run. No bookings are created, so
 * the cascade from Tenant is enough to clean up.
 */
import { prisma } from "../src/lib/db/prisma";
import {
  createService,
  getActiveServices,
  getServicesForTenant,
  setServiceActive,
  updateService,
} from "../src/lib/db/services";
import {
  createStaff,
  getActiveStaff,
  getStaffForManagement,
  getWorkingHoursForActiveStaff,
  replaceWorkingHours,
  setStaffActive,
  updateStaff,
} from "../src/lib/db/staff";

/** Two tenants, because half of what's under test is that they can't see each other. */
const OURS = "probe-crud-tenant-ours";
const THEIRS = "probe-crud-tenant-theirs";

const NOW = new Date(Date.UTC(2030, 5, 10, 12, 0, 0, 0));

/** Monday 09:00–13:00 and 14:00–18:00 — a split shift, the case worth proving. */
const SPLIT_SHIFT = [
  { dayOfWeek: 1, startMinute: 9 * 60, endMinute: 13 * 60 },
  { dayOfWeek: 1, startMinute: 14 * 60, endMinute: 18 * 60 },
];

/**
 * How many check() calls a complete run makes.
 *
 * Asserted at the end, because "no failures" is also what a run prints when it
 * never reached half its phases — a deleted assertion, an early return, or a
 * refactor that quietly stopped calling one. `failures === 0` cannot tell those
 * apart from success, and this probe is the only evidence for the tenant
 * boundary, so "it passed" has to mean "all of it ran".
 *
 * Every check() here is unconditional and outside any loop, so this is a fixed
 * number. Adding or removing a check means moving it, and that is the point: it
 * makes dropping one a deliberate act rather than a silent one.
 *
 * Excludes the count check itself, which is reported separately below.
 */
const EXPECTED_CHECKS = 18;

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

async function teardown() {
  await prisma.tenant.deleteMany({ where: { id: { in: [OURS, THEIRS] } } });
}

async function setup() {
  for (const [id, slug] of [
    [OURS, "probe-crud-ours"],
    [THEIRS, "probe-crud-theirs"],
  ]) {
    await prisma.tenant.create({
      data: {
        id,
        slug,
        name: `CRUD Probe (${slug}, throwaway)`,
        timezone: "Europe/Berlin",
        contactEmail: `${slug}@probe.test`,
      },
    });
  }
}

async function main() {
  await teardown();
  await setup();

  try {
    console.log("\nPhase A — a service is created, edited and retired, never deleted");

    const service = await createService(OURS, {
      name: "Probe Haircut",
      durationMinutes: 30,
      priceMinorUnits: 2500,
      category: "Hair",
    });

    const created = (await getServicesForTenant(OURS))[0];
    check(
      "A1",
      created?.id === service.id &&
        created?.priceMinorUnits === 2500 &&
        created?.active === true,
      `created ${created?.name} at ${created?.priceMinorUnits} cents, active=${created?.active}`,
    );

    await updateService(OURS, service.id, {
      name: "Probe Haircut",
      durationMinutes: 45,
      priceMinorUnits: 3000,
      // Clearing a category has to actually clear it — the write spreads an
      // explicit null rather than omitting the key, which Prisma reads as "no
      // change".
      category: undefined,
    });

    const edited = (await getServicesForTenant(OURS))[0];
    check(
      "A2",
      edited?.durationMinutes === 45 &&
        edited?.priceMinorUnits === 3000 &&
        edited?.category === null,
      `edited to ${edited?.durationMinutes} min / ${edited?.priceMinorUnits} cents / category=${edited?.category}`,
    );

    await setServiceActive(OURS, service.id, false);
    const publicList = await getActiveServices(OURS);
    const ownerList = await getServicesForTenant(OURS);
    check(
      "A3",
      publicList.length === 0 && ownerList.length === 1 && !ownerList[0].active,
      `retired: public sees ${publicList.length}, owner sees ${ownerList.length} (row survives)`,
    );

    await setServiceActive(OURS, service.id, true);
    check(
      "A4",
      (await getActiveServices(OURS)).length === 1,
      "restored: bookable again",
    );

    console.log("\nPhase B — another tenant cannot touch that service");

    const crossUpdate = await updateService(THEIRS, service.id, {
      name: "Hijacked",
      durationMinutes: 5,
      priceMinorUnits: 1,
      category: undefined,
    });
    const crossRetire = await setServiceActive(THEIRS, service.id, false);
    const untouched = (await getServicesForTenant(OURS))[0];

    check(
      "B1",
      !crossUpdate.ok && crossUpdate.reason === "NOT_FOUND",
      `updateService across tenants -> ${JSON.stringify(crossUpdate)}`,
    );
    check(
      "B2",
      !crossRetire.ok && crossRetire.reason === "NOT_FOUND",
      `setServiceActive across tenants -> ${JSON.stringify(crossRetire)}`,
    );
    check(
      "B3",
      untouched?.name === "Probe Haircut" &&
        untouched?.priceMinorUnits === 3000 &&
        untouched?.active === true,
      `row unchanged: ${untouched?.name} at ${untouched?.priceMinorUnits} cents, active=${untouched?.active}`,
    );
    check(
      "B4",
      (await getServicesForTenant(THEIRS)).length === 0,
      "the other tenant still has no services of its own",
    );

    console.log("\nPhase C — working hours, the write with no tenantId column of its own");

    // photoUrl is spelled out rather than omitted: the schema's transform makes
    // it `string | undefined` — an optional *value*, not an optional key — so
    // leaving it off is a type error even though the column is nullable.
    const barber = await createStaff(OURS, {
      name: "Probe Barber",
      photoUrl: undefined,
    });
    const fresh = await getStaffForManagement(OURS, NOW);
    check(
      "C1",
      fresh.length === 1 &&
        fresh[0].workingHours.length === 0 &&
        fresh[0].upcomingBookings === 0,
      // A new barber gets no hours on purpose: opening hours are the union of
      // what the staff work, so inventing a default would change what the public
      // page says the shop is open.
      `new barber has ${fresh[0]?.workingHours.length} intervals and ${fresh[0]?.upcomingBookings} bookings ahead`,
    );

    const crossHours = await replaceWorkingHours(THEIRS, barber.id, SPLIT_SHIFT);
    check(
      "C2",
      !crossHours.ok && crossHours.reason === "NOT_FOUND",
      `replaceWorkingHours across tenants -> ${JSON.stringify(crossHours)}`,
    );

    await replaceWorkingHours(OURS, barber.id, SPLIT_SHIFT);
    const withShift = (await getStaffForManagement(OURS, NOW))[0];
    check(
      "C3",
      withShift.workingHours.length === 2 &&
        withShift.workingHours[0].startMinute === 540 &&
        withShift.workingHours[1].startMinute === 840,
      `split shift round-trips: ${withShift.workingHours
        .map((row) => `${row.startMinute}-${row.endMinute}`)
        .join(", ")}`,
    );

    // The destructive half of the boundary check: a foreign tenant must not be
    // able to empty someone's week either, since deleteMany takes only staffId.
    const crossWipe = await replaceWorkingHours(THEIRS, barber.id, []);
    const stillThere = (await getStaffForManagement(OURS, NOW))[0];
    check(
      "C4",
      !crossWipe.ok && stillThere.workingHours.length === 2,
      `cross-tenant wipe refused, ${stillThere.workingHours.length} intervals intact`,
    );

    await replaceWorkingHours(OURS, barber.id, [
      { dayOfWeek: 1, startMinute: 10 * 60, endMinute: 16 * 60 },
    ]);
    const replaced = (await getStaffForManagement(OURS, NOW))[0];
    check(
      "C5",
      replaced.workingHours.length === 1 &&
        replaced.workingHours[0].startMinute === 600,
      // Replace, not merge: the editor posts the whole week, so the old rows
      // must be gone rather than accumulated.
      `replacing leaves ${replaced.workingHours.length} interval, not 3`,
    );

    console.log("\nPhase D — removing a barber is active = false, and reversible");

    await updateStaff(OURS, barber.id, {
      name: "Probe Barber Renamed",
      photoUrl: undefined,
    });
    await setStaffActive(OURS, barber.id, false);

    const bookable = await getActiveStaff(OURS);
    const managed = await getStaffForManagement(OURS, NOW);
    const shopHours = await getWorkingHoursForActiveStaff(OURS);

    check(
      "D1",
      bookable.length === 0 && managed.length === 1 && !managed[0].active,
      `retired: bookable ${bookable.length}, owner sees ${managed.length} (row survives)`,
    );
    check(
      "D2",
      managed[0].name === "Probe Barber Renamed" &&
        managed[0].workingHours.length === 1,
      // Hours are kept on deactivation, so bringing someone back restores them
      // as they were rather than as an empty week.
      `rename applied and ${managed[0].workingHours.length} interval kept`,
    );
    check(
      "D3",
      shopHours.length === 0,
      // The shop's published opening hours are the union of *active* staff's
      // hours, so deactivating withdraws them.
      "deactivating withdraws the hours from the shop's opening hours",
    );

    await setStaffActive(OURS, barber.id, true);
    check(
      "D4",
      (await getActiveStaff(OURS)).length === 1 &&
        (await getWorkingHoursForActiveStaff(OURS)).length === 1,
      "brought back with their hours intact",
    );

    const crossStaff = await updateStaff(THEIRS, barber.id, {
      name: "Hijacked",
      photoUrl: undefined,
    });
    const crossDeactivate = await setStaffActive(THEIRS, barber.id, false);
    check(
      "D5",
      !crossStaff.ok &&
        !crossDeactivate.ok &&
        (await getActiveStaff(OURS)).length === 1,
      `cross-tenant staff writes refused, barber still active`,
    );
  } finally {
    await teardown();
    await prisma.$disconnect();
  }

  reportCheckCount();

  console.log(
    failures === 0
      ? "\nAll CRUD checks passed.\n"
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
