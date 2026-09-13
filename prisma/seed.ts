/**
 * The demo tenant: a shop that looks like a real shop.
 *
 *   npm run db:seed
 *
 * This is what a prospect sees, so it seeds a full week of appointments either
 * side of today rather than an empty diary — a calendar with nothing in it
 * demonstrates nothing, and the density tiers, the week view, the overview's
 * takings and the "fully booked" empty state all need real rows to have
 * anything to say. Re-running it re-anchors that week to the current date,
 * which makes this the reset button to press before a meeting.
 *
 * NOTHING HERE IS DEMO-ONLY BEHAVIOUR. It writes rows through the same helpers
 * the app writes through; every screen renders it with the same components
 * every paying tenant gets. If this file ever needs a component or a branch of
 * its own, the demo has stopped proving the product works.
 *
 * Idempotent by construction: fixed ids for the tenant, staff, services and
 * customers, and a delete-then-recreate for the rows that are anchored to *now*
 * (bookings, time off) and so can't be upserted in place.
 *
 * WHAT A RE-RUN DESTROYS, deliberately: EVERY booking, customer and staff
 * absence belonging to this tenant, seeded or not.
 *
 * That is deliberately blunt, and it was not the first attempt. Preserving
 * hand-made bookings sounds kinder and is worse: this tenant had accumulated
 * two dozen of them across Days 7–12, and by Day 13 they were bookings sitting
 * outside the hours their barber now works, past appointments still marked
 * CONFIRMED, and a fortnight of cancellations from testing the cancel flow —
 * all of it on the calendar a prospect is shown. The point of this script is
 * that the state after it runs is *known*, and "known plus whatever survived"
 * isn't. Nothing of value is lost: a demo booking's job ends with the demo.
 *
 * What it leaves alone: the owner's password, and the tenant's timezone and
 * booking rules — those are owner-editable and a reset of the diary has no
 * business reaching into the settings screen.
 *
 * The blast radius is one tenant, resolved by the fixed slug below. It cannot
 * reach a real shop's data unless a real shop is given the demo's slug.
 */
import { DateTime } from "luxon";

import { hashPassword } from "../src/lib/auth/password";
import { createBooking, type BookingStatus } from "../src/lib/db/bookings";
// The shared client rather than a second `new PrismaClient()`: this script now
// writes through lib/db helpers, which hold that singleton, and two clients
// would mean two connection pools racing over the same rows. The
// no-restricted-imports rule (CLAUDE.md rule 1) guards src/** — code that
// serves a request and therefore has a tenant boundary to leak. A build-time
// seed has neither.
import { prisma } from "../src/lib/db/prisma";

// ---------------------------------------------------------------------------
// The shop
// ---------------------------------------------------------------------------

const TENANT_ID = "seed-tenant-demo";
const SLUG = "kastanien-barbershop";

/**
 * The slug this tenant had before Day 13. Kept so an existing database is
 * renamed in place rather than growing a second demo tenant beside the first —
 * which is what a plain upsert-by-slug would have done, orphaning the old
 * staff and services (upserted by id, so they'd stay pointed at the old row)
 * and, worse, stranding the owner login on a tenant nothing links to.
 *
 * Safe to delete once every database that matters has been re-seeded.
 */
const LEGACY_SLUG = "demo-barbershop";

const TIMEZONE = "Europe/Berlin";

const OWNER_EMAIL = (process.env.SEED_OWNER_EMAIL ?? "owner@demo.test")
  .trim()
  .toLowerCase();
const OWNER_PASSWORD = process.env.SEED_OWNER_PASSWORD ?? "demo-password-123";

/** Minutes from midnight, tenant-local — the unit WorkingHours stores. */
function hm(hour: number, minute = 0): number {
  return hour * 60 + minute;
}

// ---------------------------------------------------------------------------
// Staff
// ---------------------------------------------------------------------------

type StaffKey = "marco" | "ivan" | "deniz";

const STAFF: { key: StaffKey; name: string }[] = [
  { key: "marco", name: "Marco Rossi" },
  { key: "ivan", name: "Ivan Novak" },
  { key: "deniz", name: "Deniz Kaya" },
];

/**
 * Deliberately three different shapes of week, because opening hours in this
 * product are per-staff and there is no business-level hours field — a demo
 * where everyone works identical hours would leave a prospect assuming there is
 * one.
 *
 * The consequences are the interesting part and are all visible on screen:
 * Monday is Marco alone, nobody works Sunday (which is the entire mechanism for
 * "closed Sunday" — the absence of hours, not a flag), and the last hour of a
 * Thursday belongs to Ivan and Deniz only.
 *
 * dayOfWeek: 0 = Sunday .. 6 = Saturday, matching schema.prisma.
 */
const WORKING_HOURS: Record<
  StaffKey,
  { dayOfWeek: number; startMinute: number; endMinute: number }[]
> = {
  // Full-timer, in early, half day Saturday.
  marco: [
    ...[1, 2, 3, 4, 5].map((dayOfWeek) => ({
      dayOfWeek,
      startMinute: hm(9),
      endMinute: hm(18),
    })),
    { dayOfWeek: 6, startMinute: hm(9), endMinute: hm(14) },
  ],
  // Late shift, no Mondays.
  ivan: [
    ...[2, 3, 4, 5].map((dayOfWeek) => ({
      dayOfWeek,
      startMinute: hm(11),
      endMinute: hm(20),
    })),
    { dayOfWeek: 6, startMinute: hm(10), endMinute: hm(16) },
  ],
  // Part-time, end of the week only.
  deniz: [
    { dayOfWeek: 4, startMinute: hm(12), endMinute: hm(20) },
    { dayOfWeek: 5, startMinute: hm(12), endMinute: hm(20) },
    { dayOfWeek: 6, startMinute: hm(9), endMinute: hm(17) },
  ],
};

// ---------------------------------------------------------------------------
// Services
// ---------------------------------------------------------------------------

type ServiceKey =
  | "haircut"
  | "fade"
  | "buzz"
  | "lineup"
  | "kids"
  | "beard"
  | "shave"
  | "combo"
  | "works";

/**
 * A real shop's menu: nine services, three categories, prices in EUR cents.
 * Illustrative demo prices, not calibrated to any specific local market.
 *
 * The durations are chosen to span the calendar's density tiers, which is the
 * only way to see them behave: at 80px an hour, "Line-up" (15 min) renders at
 * 20px and "Buzz cut"/"Beard trim" (20 min) at 27px — the `minimal` tier, one
 * line of text — while a 45-minute fade gets the full three. Nothing here
 * reaches `sliver` (under 13px, i.e. under 10 minutes), and that is honest:
 * no barbershop sells a 5-minute appointment.
 *
 * Categories are rendered in the order getActiveServices returns them, which is
 * alphabetical — Haircuts, Packages, Shaving & beard. Named with that in mind.
 */
const SERVICES: {
  key: ServiceKey;
  name: string;
  durationMinutes: number;
  priceMinorUnits: number;
  category: string;
}[] = [
  { key: "haircut", name: "Haircut", durationMinutes: 35, priceMinorUnits: 3200, category: "Haircuts" },
  { key: "fade", name: "Skin fade", durationMinutes: 45, priceMinorUnits: 3800, category: "Haircuts" },
  { key: "buzz", name: "Buzz cut", durationMinutes: 20, priceMinorUnits: 2200, category: "Haircuts" },
  { key: "lineup", name: "Line-up", durationMinutes: 15, priceMinorUnits: 1200, category: "Haircuts" },
  { key: "kids", name: "Kids cut (under 12)", durationMinutes: 25, priceMinorUnits: 2200, category: "Haircuts" },
  { key: "beard", name: "Beard trim", durationMinutes: 20, priceMinorUnits: 1800, category: "Shaving & beard" },
  { key: "shave", name: "Hot towel shave", durationMinutes: 40, priceMinorUnits: 3400, category: "Shaving & beard" },
  { key: "combo", name: "Cut & beard", durationMinutes: 60, priceMinorUnits: 4600, category: "Packages" },
  { key: "works", name: "The full works", durationMinutes: 75, priceMinorUnits: 5800, category: "Packages" },
];

const SERVICE_BY_KEY = new Map(SERVICES.map((service) => [service.key, service]));

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------

/**
 * Phones are stored in the canonical form normalizePhone produces (digits, a
 * leading `+`), not the shape a human would type. That matters: phone is the
 * tenant's identity key, so a prettily-spaced number here would fail to match
 * when the same person books through the public form, and the demo would grow a
 * duplicate of every regular.
 *
 * The 5550 block is a deliberately unassigned-looking pattern, and the
 * addresses are on example.com (reserved by RFC 2606) — nothing here can reach
 * a real person if a demo tenant ever sends mail.
 */
const CUSTOMERS: { name: string; phone: string; email?: string }[] = [
  { name: "Jonas Weber", phone: "+4915155500001", email: "jonas.weber@example.com" },
  { name: "Leon Fischer", phone: "+4915155500002" },
  { name: "Mehmet Demir", phone: "+4915155500003", email: "mehmet.demir@example.com" },
  { name: "Paul Schneider", phone: "+4915155500004" },
  { name: "Lukas Braun", phone: "+4915155500005", email: "lukas.braun@example.com" },
  { name: "Emre Yildiz", phone: "+4915155500006" },
  { name: "Felix Hoffmann", phone: "+4915155500007", email: "felix.hoffmann@example.com" },
  { name: "Tobias Krüger", phone: "+4915155500008" },
  { name: "Marc Lehmann", phone: "+4915155500009", email: "marc.lehmann@example.com" },
  { name: "David Nowak", phone: "+4915155500010" },
  { name: "Sami Haddad", phone: "+4915155500011", email: "sami.haddad@example.com" },
  { name: "Julian Vogt", phone: "+4915155500012" },
  { name: "Nico Brandt", phone: "+4915155500013", email: "nico.brandt@example.com" },
  { name: "Anton Krause", phone: "+4915155500014" },
  { name: "Kerem Aslan", phone: "+4915155500015", email: "kerem.aslan@example.com" },
  { name: "Philipp Roth", phone: "+4915155500016" },
  { name: "Jan Kowalski", phone: "+4915155500017", email: "jan.kowalski@example.com" },
  { name: "Omar Nasser", phone: "+4915155500018" },
  { name: "Simon Beck", phone: "+4915155500019", email: "simon.beck@example.com" },
  { name: "Elias Frank", phone: "+4915155500020" },
];

const customerId = (index: number) =>
  `seed-cust-${String(index + 1).padStart(2, "0")}`;

// ---------------------------------------------------------------------------
// The week
// ---------------------------------------------------------------------------

/** How far either side of today the diary is filled. */
const DAYS_BEFORE = 7;
const DAYS_AFTER = 7;

type Appointment = {
  staff: StaffKey;
  /** Minutes from midnight, tenant-local. */
  at: number;
  service: ServiceKey;
  /** Index into CUSTOMERS. */
  customer: number;
  /** MANUAL is a walk-in the owner typed in at the counter. */
  manual?: boolean;
};

/**
 * Six days of appointments, cycled across the fortnight.
 *
 * Fixed tables rather than random generation: a demo that reshuffles itself on
 * every run can't be rehearsed, and a random schedule eventually produces a day
 * that looks wrong (three barbers all free at 11, or a wall with no gap in it).
 *
 * Each day is deliberately left with holes. A prospect has to be able to book a
 * real appointment on their own phone in front of you, and that only works if
 * there is something free to book.
 *
 * Entries are filtered at generation time against the barber's working hours
 * for that weekday and against seeded time off, so the same table produces a
 * thin Monday (Marco alone), a busy Thursday (all three in), and nothing at all
 * on Sunday. An entry that doesn't fit is dropped, not moved.
 */
const DAY_TEMPLATES: Appointment[][] = [
  [
    { staff: "marco", at: hm(9, 30), service: "haircut", customer: 0 },
    { staff: "marco", at: hm(10, 30), service: "combo", customer: 1 },
    { staff: "marco", at: hm(14), service: "beard", customer: 2, manual: true },
    { staff: "ivan", at: hm(11, 30), service: "fade", customer: 3 },
    { staff: "ivan", at: hm(13), service: "haircut", customer: 4 },
    { staff: "ivan", at: hm(17), service: "shave", customer: 5 },
    { staff: "deniz", at: hm(12, 30), service: "haircut", customer: 6 },
    { staff: "deniz", at: hm(15), service: "lineup", customer: 7, manual: true },
  ],
  [
    { staff: "marco", at: hm(9), service: "buzz", customer: 8 },
    { staff: "marco", at: hm(11), service: "fade", customer: 9 },
    { staff: "marco", at: hm(15, 30), service: "haircut", customer: 10 },
    { staff: "ivan", at: hm(12), service: "combo", customer: 11 },
    { staff: "ivan", at: hm(15), service: "beard", customer: 0 },
    { staff: "deniz", at: hm(13, 30), service: "works", customer: 1 },
  ],
  [
    { staff: "marco", at: hm(10), service: "kids", customer: 2, manual: true },
    { staff: "marco", at: hm(13), service: "haircut", customer: 3 },
    { staff: "ivan", at: hm(11), service: "haircut", customer: 4 },
    { staff: "ivan", at: hm(16, 30), service: "fade", customer: 5 },
    { staff: "deniz", at: hm(14), service: "beard", customer: 6 },
  ],
  [
    { staff: "marco", at: hm(9, 30), service: "combo", customer: 7 },
    { staff: "marco", at: hm(12), service: "lineup", customer: 8, manual: true },
    { staff: "marco", at: hm(16), service: "haircut", customer: 9 },
    { staff: "ivan", at: hm(14), service: "works", customer: 10 },
    { staff: "ivan", at: hm(18), service: "haircut", customer: 11 },
    { staff: "deniz", at: hm(16), service: "fade", customer: 0 },
  ],
  [
    { staff: "marco", at: hm(10, 30), service: "shave", customer: 1 },
    { staff: "marco", at: hm(14, 30), service: "haircut", customer: 2 },
    { staff: "ivan", at: hm(11, 30), service: "beard", customer: 3, manual: true },
    { staff: "ivan", at: hm(15, 30), service: "haircut", customer: 4 },
    { staff: "deniz", at: hm(12), service: "combo", customer: 5 },
  ],
  [
    { staff: "marco", at: hm(9), service: "haircut", customer: 6 },
    { staff: "marco", at: hm(11, 30), service: "kids", customer: 7 },
    { staff: "ivan", at: hm(13, 30), service: "lineup", customer: 8 },
    { staff: "ivan", at: hm(16), service: "combo", customer: 9 },
    { staff: "deniz", at: hm(17), service: "haircut", customer: 10 },
  ],
];

/**
 * Time off, as day offsets from today.
 *
 * One whole-day range and one part-day, because formatTimeOffRange recovers
 * which shape the owner picked from the instants alone and the two render
 * differently ("13 – 16 Aug" against "9 Aug, 14:00–16:30"). Both are in the
 * future, since the staff screen hides an absence once it has finished.
 *
 * A whole-day range ends at the local midnight *after* the last day away —
 * the end instant is exclusive, which is what the display subtracts a day from.
 */
type TimeOffSpec = { staff: StaffKey; reason: string } & (
  | /** Whole-day: [first day away, first day back). */
  { wholeDays: { fromOffset: number; toOffset: number }; partDay?: never }
  | /** Part-day: minutes from midnight on one day. */
  { partDay: { offset: number; from: number; to: number }; wholeDays?: never }
);

const TIME_OFF: TimeOffSpec[] = [
  {
    staff: "ivan",
    reason: "Holiday",
    wholeDays: { fromOffset: 9, toOffset: 13 },
  },
  {
    staff: "marco",
    reason: "Dentist",
    partDay: { offset: 3, from: hm(14), to: hm(16, 30) },
  },
];

// ---------------------------------------------------------------------------

async function main() {
  const tenant = await upsertTenant();
  const owner = await upsertOwner(tenant.id);

  await upsertStaff(tenant.id);
  await upsertServices(tenant.id);

  const cleared = await clearDiary(tenant.id);
  const customerIds = await upsertCustomers(tenant.id);
  const timeOff = await createTimeOff();
  const booked = await replaceBookings(tenant.id, customerIds, timeOff);

  console.log(`Seeded "${tenant.name}"  →  /b/${tenant.slug}`);
  console.log(`  owner      ${owner.email}`);
  console.log(`  staff      ${STAFF.map((s) => s.name).join(", ")}`);
  console.log(`  services   ${SERVICES.length}`);
  console.log(
    `  cleared    ${cleared.bookings} booking(s), ${cleared.customers} customer(s), ${cleared.timeOff} absence(s)`,
  );
  console.log(
    `  time off   ${timeOff.length} upcoming (${TIME_OFF.map((entry) => entry.reason).join(", ")})`,
  );
  console.log(
    `  bookings   ${booked.created} across ${DAYS_BEFORE} days back and ${DAYS_AFTER} forward`,
  );
  console.log(
    `  dropped    ${booked.outsideHours} outside working hours, ${booked.duringTimeOff} during time off`,
  );

  // Loud, because it means the templates and the tenant's buffer disagree and
  // the demo week is thinner than it reads above.
  if (booked.slotTaken > 0) {
    console.warn(
      `\n! ${booked.slotTaken} booking(s) rejected by the overlap constraint.` +
        `\n  The gaps in DAY_TEMPLATES are too tight for this tenant's bufferMinutes.`,
    );
  }
  console.log(
    `\nThe password is only set when the owner is first created. Use\n  npm run reset-password ${owner.email}\nto change it.`,
  );
}

/**
 * The tenant row, found by its current slug, then its previous one, then
 * created.
 *
 * `timezone` and the three booking rules are set on create and never on update.
 * Both are owner-editable now (Day 12) and both have consequences a re-seed has
 * no business causing silently: changing a timezone redraws every existing
 * booking's displayed time without moving the stored instant, and raising the
 * cancellation window can strand a customer who was promised a different one.
 * Same posture as the password below.
 */
async function upsertTenant() {
  const display = {
    slug: SLUG,
    name: "Kastanien Barbershop",
    address: "Königstraße 12, 70173 Stuttgart",
    phone: "+49 711 4401278",
    contactEmail: OWNER_EMAIL,
  };

  const existing =
    (await prisma.tenant.findUnique({ where: { slug: SLUG } })) ??
    (await prisma.tenant.findUnique({ where: { slug: LEGACY_SLUG } }));

  if (existing) {
    return prisma.tenant.update({ where: { id: existing.id }, data: display });
  }

  return prisma.tenant.create({
    data: { id: TENANT_ID, timezone: TIMEZONE, ...display },
  });
}

async function upsertOwner(tenantId: string) {
  const passwordHash = await hashPassword(OWNER_PASSWORD);

  return prisma.user.upsert({
    where: { email: OWNER_EMAIL },
    // Deliberately does NOT touch passwordHash on update — re-seeding must not
    // silently undo a password set via scripts/reset-password.ts.
    update: { tenantId },
    create: { tenantId, email: OWNER_EMAIL, passwordHash, role: "OWNER" },
  });
}

/**
 * Staff, their hours, and the cleanup for both.
 *
 * Hours are deleted rather than merely upserted, because the set shrinks: Ivan
 * had a Monday in the pre-Day-13 seed and doesn't now, and an upsert-only pass
 * would leave that row behind — a barber working a day this file says he
 * doesn't, which the public booking page would faithfully offer.
 *
 * A barber dropped from STAFF entirely is deactivated, never deleted: there is
 * no hard delete for Staff in this product (CLAUDE.md), and existing bookings
 * point at these rows.
 */
async function upsertStaff(tenantId: string) {
  const ids: string[] = [];

  for (const { key, name } of STAFF) {
    const id = staffId(key);
    ids.push(id);

    await prisma.staff.upsert({
      where: { id },
      update: { name, active: true },
      create: { id, tenantId, name },
    });

    const wanted = WORKING_HOURS[key].map((hours) => ({
      id: `seed-wh-${id}-${hours.dayOfWeek}`,
      ...hours,
    }));

    await prisma.workingHours.deleteMany({
      where: { staffId: id, id: { notIn: wanted.map((row) => row.id) } },
    });

    for (const { id: hoursId, ...hours } of wanted) {
      await prisma.workingHours.upsert({
        where: { id: hoursId },
        update: hours,
        create: { id: hoursId, staffId: id, ...hours },
      });
    }
  }

  await prisma.staff.updateMany({
    where: { tenantId, id: { startsWith: "seed-staff-" }, NOT: { id: { in: ids } } },
    data: { active: false },
  });
}

/** Same deactivate-don't-delete rule as staff, for the same reason. */
async function upsertServices(tenantId: string) {
  const ids: string[] = [];

  for (const { key, ...service } of SERVICES) {
    const id = serviceId(key);
    ids.push(id);

    await prisma.service.upsert({
      where: { id },
      update: { ...service, active: true },
      create: { id, tenantId, ...service },
    });
  }

  await prisma.service.updateMany({
    where: { tenantId, id: { startsWith: "seed-service-" }, NOT: { id: { in: ids } } },
    data: { active: false },
  });
}

/**
 * Everything the demo's week is made of, removed so it can be rebuilt against
 * today's date. See the note at the top of this file for why this is a clean
 * sweep rather than a surgical one.
 *
 * Bookings before customers: Booking.customerId is `onDelete: Restrict`, so the
 * other order fails on the first customer who has ever booked. Staff and
 * services are deliberately not in here — they are upserted, because bookings
 * point at them under the same Restrict and because "removing" either means
 * `active = false` in this product, never a delete.
 */
async function clearDiary(
  tenantId: string,
): Promise<{ bookings: number; customers: number; timeOff: number }> {
  const bookings = await prisma.booking.deleteMany({ where: { tenantId } });
  const customers = await prisma.customer.deleteMany({ where: { tenantId } });
  // TimeOff has no tenantId of its own — the only tenant scope it has is the
  // staff row it hangs off, so this filters through the relation. Same shape as
  // deleteTimeOff in lib/db/staff.ts, and for the same reason.
  const timeOff = await prisma.timeOff.deleteMany({
    where: { staff: { tenantId } },
  });

  return {
    bookings: bookings.count,
    customers: customers.count,
    timeOff: timeOff.count,
  };
}

/**
 * Customers, by fixed id rather than through findOrCreateCustomer.
 *
 * The helper resolves by phone, which is right for a booking arriving from the
 * public form, but this script wants the same twelve rows to come back with the
 * same ids on every run so the templates below can address them by index.
 */
async function upsertCustomers(tenantId: string): Promise<string[]> {
  const ids: string[] = [];

  for (const [index, customer] of CUSTOMERS.entries()) {
    const id = customerId(index);
    ids.push(id);

    await prisma.customer.upsert({
      where: { id },
      update: customer,
      create: { id, tenantId, ...customer },
    });
  }

  return ids;
}

type TimeOffRange = { staffId: string; startAt: Date; endAt: Date };

/** Created fresh every run, because both ranges are anchored to today. */
async function createTimeOff(): Promise<TimeOffRange[]> {
  const ranges: TimeOffRange[] = [];

  for (const entry of TIME_OFF) {
    const id = staffId(entry.staff);

    const { startAt, endAt } = entry.wholeDays
      ? {
          startAt: localDay(entry.wholeDays.fromOffset).toJSDate(),
          endAt: localDay(entry.wholeDays.toOffset).toJSDate(),
        }
      : {
          startAt: localTime(entry.partDay.offset, entry.partDay.from),
          endAt: localTime(entry.partDay.offset, entry.partDay.to),
        };

    await prisma.timeOff.create({
      data: { staffId: id, startAt, endAt, reason: entry.reason },
    });

    ranges.push({ staffId: id, startAt, endAt });
  }

  return ranges;
}

/**
 * The diary.
 *
 * Written through createBooking rather than prisma.booking.create, so every
 * seeded row gets the same endAt/blockedUntil arithmetic, the same CSPRNG
 * cancel token and the same rule-2a tenant re-check that a real booking gets.
 * A seed that built those fields by hand would be a second implementation of
 * them, free to drift from the real one and quietly make the demo prove
 * something the product doesn't do.
 *
 * Statuses are applied afterwards because createBooking only ever inserts
 * CONFIRMED — correctly, since that is the only status a booking can be created
 * in. Past days get COMPLETED with a scattering of cancellations and one
 * no-show; today is split at the current time; the future stays CONFIRMED.
 */
async function replaceBookings(
  tenantId: string,
  customerIds: string[],
  timeOff: TimeOffRange[],
): Promise<{
  created: number;
  outsideHours: number;
  duringTimeOff: number;
  slotTaken: number;
}> {
  const now = new Date();
  let created = 0;
  // Three separate counters, because only one of them is a problem. Dropping an
  // appointment that falls outside a barber's hours or inside their holiday is
  // this generator working as designed; a SLOT_TAKEN is the exclusion
  // constraint rejecting an overlap the templates above should never have
  // produced. Summed into one number, the third would hide behind the first two.
  let outsideHours = 0;
  let duringTimeOff = 0;
  let slotTaken = 0;

  for (let offset = -DAYS_BEFORE; offset <= DAYS_AFTER; offset++) {
    const day = localDay(offset);
    const dayOfWeek = day.weekday % 7; // Luxon: 1 = Mon .. 7 = Sun
    const template =
      DAY_TEMPLATES[
        ((offset % DAY_TEMPLATES.length) + DAY_TEMPLATES.length) %
          DAY_TEMPLATES.length
      ];

    for (const entry of template) {
      const service = SERVICE_BY_KEY.get(entry.service);
      if (!service) continue;

      const hours = WORKING_HOURS[entry.staff].find(
        (row) => row.dayOfWeek === dayOfWeek,
      );
      const endsAt = entry.at + service.durationMinutes;

      // Outside this barber's hours on this weekday — a Sunday, Ivan's Monday,
      // or a 17:00 appointment on a Saturday that finishes at 14:00.
      if (!hours || entry.at < hours.startMinute || endsAt > hours.endMinute) {
        outsideHours++;
        continue;
      }

      const id = staffId(entry.staff);
      const startAt = localTime(offset, entry.at);
      // Who sits in this chair rotates by the day, so the same customer doesn't
      // land in the same slot every sixth day when the templates come round
      // again — which is what a fortnight of six repeating days otherwise looks
      // like on the week view.
      //
      // It also spreads the load across phone numbers, which matters because the
      // public form's rate limiter counts a customer's *upcoming* bookings.
      // Measured after this change: 4 upcoming on the busiest seeded number,
      // against a limit of 5. Comfortable but not enormous — so demo the booking
      // flow with a real phone number, not one of the seeded ones. (Every seeded
      // booking also shares one createdAt, so for an hour after seeding all
      // twenty numbers are over the separate "3 bookings in 60 minutes" limit.)
      const customer =
        customerIds[
          (((entry.customer + offset) % customerIds.length) +
            customerIds.length) %
            customerIds.length
        ];
      const endAtInstant = localTime(offset, endsAt);

      // Time off doesn't cancel appointments already made — that's the app's
      // deliberate posture, advisory not blocking. But a *seeded* booking
      // sitting inside a *seeded* absence is a demo contradicting itself on
      // screen, so this file simply doesn't create one.
      const away = timeOff.some(
        (range) =>
          range.staffId === id &&
          startAt < range.endAt &&
          endAtInstant > range.startAt,
      );
      if (away) {
        duringTimeOff++;
        continue;
      }

      const result = await createBooking({
        tenantId,
        staffId: id,
        serviceId: serviceId(entry.service),
        customerId: customer,
        startAt,
        source: entry.manual ? "MANUAL" : "ONLINE",
      });

      // The exclusion constraint rejected it — reachable if the tenant's buffer
      // has been raised past the gaps in the templates above. Counted and
      // reported rather than thrown: the rest of the week is still worth having.
      if (!result.ok) {
        slotTaken++;
        continue;
      }

      created++;

      const status = statusFor(endAtInstant, now, created);
      if (status !== "CONFIRMED") {
        await prisma.booking.update({
          where: { id: result.booking.id },
          data: { status },
        });
      }
    }
  }

  return { created, outsideHours, duringTimeOff, slotTaken };
}

/**
 * What became of an appointment.
 *
 * Deterministic rather than random, so the same run twice produces the same
 * demo. The moduli are coprime with each other and with the number of
 * appointments in a day, which is what keeps the exceptions from landing on the
 * same barber or the same hour every time.
 */
function statusFor(endAt: Date, now: Date, index: number): BookingStatus {
  if (endAt > now) {
    // One future cancellation, so the overview has one to show and the calendar
    // has one to correctly leave out.
    return index % 23 === 11 ? "CANCELLED" : "CONFIRMED";
  }

  if (index % 9 === 4) return "CANCELLED";
  if (index % 13 === 7) return "NO_SHOW";

  return "COMPLETED";
}

const staffId = (key: StaffKey) => `seed-staff-${key}`;
const serviceId = (key: ServiceKey) => `seed-service-${key}`;

/**
 * Midnight, tenant-local, `offset` days from today.
 *
 * Luxon rather than raw Date arithmetic, and `plus({ days })` on a local
 * midnight rather than adding 24 hours: across a DST boundary a local day is 23
 * or 25 hours long, and the difference is a whole day's appointments landing an
 * hour out.
 */
function localDay(offset: number): DateTime {
  return DateTime.now().setZone(TIMEZONE).startOf("day").plus({ days: offset });
}

/** A wall-clock time on one of those days, as the UTC instant to store. */
function localTime(offset: number, minuteOfDay: number): Date {
  return localDay(offset)
    .set({ hour: Math.floor(minuteOfDay / 60), minute: minuteOfDay % 60 })
    .toJSDate();
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
