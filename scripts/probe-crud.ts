/**
 * Proves the Day 11 and 12a write helpers keep the tenant boundary, and that
 * "remove" means `active = false` everywhere it has to.
 *
 *   npm run probe:crud
 *
 * Same reason as the sibling probes: these rules live in the shape of a Prisma
 * call — a compound `where` on `updateMany`, and a re-fetch before a
 * `deleteMany` — and no unit test can reach them. What's tested here is
 * precisely what a test double would paper over.
 *
 * PHASES C AND E ARE THE ONES THAT MATTER. Neither `WorkingHours` nor `TimeOff`
 * has a `tenantId` column; the only tenant scope either has is the `staffId` it
 * hangs off. So `replaceWorkingHours` and `createTimeOff` cannot state the
 * boundary in a `where` clause the way every other write in lib/db/** does, and
 * both re-fetch the staff row scoped by tenant instead. If either check is ever
 * dropped, one shop will be able to wipe another's opening hours or close
 * another's diary — and nothing else in this repo would notice.
 *
 * `deleteTimeOff` is the one exception in that pair: a delete takes a filter, so
 * it scopes through the relation (`staff: { tenantId }`) in the query itself.
 * Phase E asserts that too, since a filter is as easy to drop as a re-fetch.
 *
 * Phases F-H were added by the Phase 15 audit: F is rule 3 (createBooking
 * re-verifying its foreign keys), G is the no-hard-delete guard in
 * src/lib/db/prisma.ts, and H is the public booking form's inability to rewrite
 * a returning customer's name or email.
 *
 * It writes real rows. Every one belongs to one of two dedicated throwaway
 * tenants that are deleted before and after the run. Phase F's control writes
 * one booking, so teardown removes bookings before the tenants.
 */
import { createBooking } from "../src/lib/db/bookings";
import { findOrCreateCustomer } from "../src/lib/db/customers";
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
  createTimeOff,
  deleteTimeOff,
  getActiveStaff,
  getStaffForManagement,
  getStaffMember,
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
 * A future absence, as instants. Phase E only cares about the tenant boundary,
 * so these are plain instants rather than anything toTimeOffRange produced — the
 * wall-clock conversion is unit-tested in lib/validation/time-off.test.ts, where
 * it can be checked against DST without a database.
 */
const HOLIDAY = {
  startAt: new Date(Date.UTC(2030, 5, 17, 0, 0, 0, 0)),
  endAt: new Date(Date.UTC(2030, 5, 20, 0, 0, 0, 0)),
};

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
const EXPECTED_CHECKS = 38;

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

/** True when `fn` throws or rejects — for the writes that must refuse loudly. */
async function rejects(fn: () => Promise<unknown>): Promise<boolean> {
  try {
    await fn();
    return false;
  } catch {
    return true;
  }
}

async function teardown() {
  // Bookings first: phase F's control writes one, and Booking -> Staff/Service/
  // Customer is onDelete: Restrict, so the cascade from Tenant can't be relied
  // on to remove them in a safe order.
  await prisma.booking.deleteMany({ where: { tenantId: { in: [OURS, THEIRS] } } });
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

    // The edit screen's read. The id is filtered in the query alongside the
    // tenant, so another shop's session asking for this barber gets nothing.
    const ownMember = await getStaffMember(OURS, barber.id, NOW);
    const crossMember = await getStaffMember(THEIRS, barber.id, NOW);
    check(
      "D6",
      ownMember?.id === barber.id && crossMember === null,
      `getStaffMember finds the barber for its own tenant only`,
    );

    console.log("\nPhase E — time off, the second write with no tenantId column");

    // Same hazard as phase C and the same reason it needs a probe: TimeOff has
    // no tenantId either, so its only scope is the staffId it hangs off. A
    // create that trusted a foreign staffId would close another shop's diary;
    // a delete filtered on id alone would reopen one.
    const crossCreate = await createTimeOff(THEIRS, barber.id, {
      startAt: HOLIDAY.startAt,
      endAt: HOLIDAY.endAt,
    });
    check(
      "E1",
      !crossCreate.ok && crossCreate.reason === "NOT_FOUND",
      `createTimeOff across tenants -> ${JSON.stringify(crossCreate)}`,
    );
    check(
      "E2",
      (await getStaffForManagement(OURS, NOW))[0].timeOff.length === 0,
      "no time off was written by the refused cross-tenant create",
    );

    await createTimeOff(OURS, barber.id, {
      startAt: HOLIDAY.startAt,
      endAt: HOLIDAY.endAt,
      reason: "Probe holiday",
    });
    const away = (await getStaffForManagement(OURS, NOW))[0].timeOff;
    check(
      "E3",
      away.length === 1 &&
        away[0].startAt.getTime() === HOLIDAY.startAt.getTime() &&
        away[0].reason === "Probe holiday",
      `time off round-trips: ${away[0]?.startAt.toISOString()} -> ${away[0]?.endAt.toISOString()}`,
    );

    const crossDelete = await deleteTimeOff(THEIRS, away[0].id);
    check(
      "E4",
      !crossDelete.ok &&
        (await getStaffForManagement(OURS, NOW))[0].timeOff.length === 1,
      `cross-tenant delete refused, time off intact -> ${JSON.stringify(crossDelete)}`,
    );

    const ownDelete = await deleteTimeOff(OURS, away[0].id);
    check(
      "E5",
      ownDelete.ok &&
        (await getStaffForManagement(OURS, NOW))[0].timeOff.length === 0,
      // A real delete, unlike staff and services: nothing references a TimeOff
      // row, so removing one reopens the time and strands nothing.
      "the owning tenant's delete removes the row for real",
    );

    // Past entries are filtered out of the owner's list on purpose — they affect
    // nothing and would otherwise accumulate. Asserted so the filter isn't
    // mistaken for a delete that didn't happen.
    await createTimeOff(OURS, barber.id, {
      startAt: new Date(NOW.getTime() - 3 * 24 * 60 * 60_000),
      endAt: new Date(NOW.getTime() - 2 * 24 * 60 * 60_000),
    });
    const listed = (await getStaffForManagement(OURS, NOW))[0].timeOff;
    const stored = await prisma.timeOff.count({ where: { staffId: barber.id } });
    check(
      "E6",
      listed.length === 0 && stored === 1,
      `past time off hidden from the list (${listed.length}) but still stored (${stored})`,
    );

    // THE CASE THE endAt FILTER EXISTS FOR, and the one E6 alone cannot prove.
    // An absence that started before now but hasn't finished must stay listed —
    // it's the one the owner is most likely to be looking for. A filter written
    // as `startAt > now` would pass every other check in this phase and hide
    // exactly this row, silently.
    await createTimeOff(OURS, barber.id, {
      startAt: new Date(NOW.getTime() - 24 * 60 * 60_000),
      endAt: new Date(NOW.getTime() + 24 * 60 * 60_000),
    });
    const inProgress = (await getStaffForManagement(OURS, NOW))[0].timeOff;
    check(
      "E7",
      inProgress.length === 1 &&
        inProgress[0].startAt < NOW &&
        inProgress[0].endAt > NOW,
      `in-progress time off stays listed: ${inProgress.length} shown, ${inProgress[0]?.startAt.toISOString()} -> ${inProgress[0]?.endAt.toISOString()} spanning now=${NOW.toISOString()}`,
    );

    console.log("\nPhase F — createBooking refuses any foreign key that isn't this tenant's");

    // CLAUDE.md rule 3. A Prisma foreign key only proves the row exists
    // somewhere, so this re-fetch is the only thing keeping one shop's booking
    // from pointing at another shop's barber, service or customer. Fresh
    // fixtures rather than phases A-E's, so this phase doesn't depend on what
    // state they happened to leave behind.
    const ownStaff = await createStaff(OURS, { name: "F Barber", photoUrl: undefined });
    const ownService = await createService(OURS, {
      name: "F Cut",
      durationMinutes: 30,
      priceMinorUnits: 2000,
      category: undefined,
    });
    const ownCustomer = await findOrCreateCustomer(
      OURS,
      { name: "F Customer", phone: "+4915100000010" },
      { updateExisting: true },
    );
    const theirStaff = await createStaff(THEIRS, { name: "F Their Barber", photoUrl: undefined });
    const theirService = await createService(THEIRS, {
      name: "F Their Cut",
      durationMinutes: 30,
      priceMinorUnits: 2000,
      category: undefined,
    });
    const theirCustomer = await findOrCreateCustomer(
      THEIRS,
      { name: "F Their Customer", phone: "+4915100000011" },
      { updateExisting: true },
    );
    const retiredStaff = await createStaff(OURS, { name: "F Retired", photoUrl: undefined });
    await setStaffActive(OURS, retiredStaff.id, false);
    const retiredService = await createService(OURS, {
      name: "F Retired Cut",
      durationMinutes: 30,
      priceMinorUnits: 2000,
      category: undefined,
    });
    await setServiceActive(OURS, retiredService.id, false);

    const bookingAt = new Date(Date.UTC(2030, 5, 11, 10, 0, 0, 0));
    const attempt = (fks: { staffId: string; serviceId: string; customerId: string }) =>
      rejects(() => createBooking({ tenantId: OURS, startAt: bookingAt, ...fks }));
    const own = {
      staffId: ownStaff.id,
      serviceId: ownService.id,
      customerId: ownCustomer.id,
    };

    check("F1", await attempt({ ...own, staffId: theirStaff.id }), "another tenant's staff refused");
    check("F2", await attempt({ ...own, serviceId: theirService.id }), "another tenant's service refused");
    check("F3", await attempt({ ...own, customerId: theirCustomer.id }), "another tenant's customer refused");
    check("F4", await attempt({ ...own, staffId: retiredStaff.id }), "an inactive barber refused");
    check("F5", await attempt({ ...own, serviceId: retiredService.id }), "an inactive service refused");

    const bookingsAfterRefusals = await prisma.booking.count({
      where: { tenantId: { in: [OURS, THEIRS] } },
    });
    check(
      "F6",
      bookingsAfterRefusals === 0,
      `refusals happen before the insert: ${bookingsAfterRefusals} bookings written`,
    );

    // The control. Without it, a createBooking that threw on everything would
    // pass F1-F5 and look like a perfect tenant boundary.
    const allOwn = await createBooking({ tenantId: OURS, startAt: bookingAt, ...own });
    check("F7", allOwn.ok, `all-own foreign keys still book -> ok=${allOwn.ok}`);

    console.log("\nPhase G — the client itself refuses to hard-delete Staff or Service");

    // A never-booked barber and service, deliberately: those are the rows that
    // `onDelete: Restrict` would NOT protect, so the extension in
    // src/lib/db/prisma.ts is the only thing in the way.
    const deletesRefused = await Promise.all([
      rejects(() => prisma.staff.delete({ where: { id: retiredStaff.id } })),
      rejects(() => prisma.staff.deleteMany({ where: { id: retiredStaff.id } })),
      rejects(() => prisma.service.delete({ where: { id: retiredService.id } })),
      rejects(() => prisma.service.deleteMany({ where: { id: retiredService.id } })),
    ]);
    check(
      "G1",
      deletesRefused.every(Boolean),
      `delete / deleteMany on staff and service all throw -> ${JSON.stringify(deletesRefused)}`,
    );
    const survivors =
      (await prisma.staff.count({ where: { id: retiredStaff.id } })) +
      (await prisma.service.count({ where: { id: retiredService.id } }));
    check("G2", survivors === 2, `both rows still stored (${survivors} of 2)`);

    console.log("\nPhase H — the public form cannot rewrite a returning customer");

    const phone = "+4915100000012";
    const first = await findOrCreateCustomer(
      OURS,
      { name: "Hanna Original", phone, email: "hanna@probe.test" },
      { updateExisting: true },
    );
    // What a stranger who knows Hanna's number would submit on the public page.
    const stranger = await findOrCreateCustomer(
      OURS,
      { name: "Someone Else", phone, email: "attacker@probe.test" },
      { updateExisting: false },
    );
    const afterPublic = await prisma.customer.findUnique({ where: { id: first.id } });
    check(
      "H1",
      stranger.id === first.id &&
        afterPublic?.name === "Hanna Original" &&
        afterPublic.email === "hanna@probe.test",
      `public path links to the same row and leaves it alone: ${afterPublic?.name} / ${afterPublic?.email}`,
    );

    // The owner's manual form is authenticated, and correcting a name is its job.
    await findOrCreateCustomer(
      OURS,
      { name: "Hanna Corrected", phone },
      { updateExisting: true },
    );
    const afterOwner = await prisma.customer.findUnique({ where: { id: first.id } });
    check(
      "H2",
      afterOwner?.name === "Hanna Corrected",
      `owner path updates the name -> ${afterOwner?.name}`,
    );
    check(
      "H3",
      afterOwner?.email === "hanna@probe.test",
      // Email is optional on the form, so a blank one must not erase the stored address.
      `a blank email keeps the stored address -> ${afterOwner?.email}`,
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
