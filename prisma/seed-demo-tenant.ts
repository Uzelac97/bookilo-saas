/**
 * The machinery behind every demo tenant: seed.ts (Kastanien Barbershop) and
 * seed-salon.ts (Salon Linde) are data tables plus one call to seedDemoTenant.
 *
 * One implementation rather than two copies, for the same reason the diary is
 * written through createBooking: a second copy of this file would be free to
 * drift from the first, and the two demos would stop proving the same thing.
 *
 * NOTHING HERE IS DEMO-ONLY BEHAVIOUR. It writes rows through the same helpers
 * the app writes through; every screen renders them with the same components
 * every paying tenant gets. If this file ever needs a component or a branch of
 * its own, the demo has stopped proving the product works.
 *
 * Idempotent by construction: fixed ids for the tenant, staff, services and
 * customers, and a delete-then-recreate for the rows that are anchored to *now*
 * (bookings, time off) and so can't be upserted in place.
 *
 * WHAT A RE-RUN DESTROYS, deliberately: EVERY booking, customer and staff
 * absence belonging to the tenant being seeded, seeded or not.
 *
 * That is deliberately blunt, and it was not the first attempt. Preserving
 * hand-made bookings sounds kinder and is worse: the barbershop demo had
 * accumulated two dozen of them across Days 7–12, and by Day 13 they were
 * bookings sitting outside the hours their barber now works, past appointments
 * still marked CONFIRMED, and a fortnight of cancellations from testing the
 * cancel flow — all of it on the calendar a visitor is shown. The point of this
 * script is that the state after it runs is *known*, and "known plus whatever
 * survived" isn't. Nothing of value is lost: a demo booking's job ends with the
 * demo.
 *
 * What it leaves alone: the owner's password, and the tenant's timezone and
 * booking rules — those are owner-editable and a reset of the diary has no
 * business reaching into the settings screen.
 *
 * The blast radius is one tenant, resolved by the spec's fixed slug. It cannot
 * reach a real shop's data unless a real shop is given a demo's slug.
 */
import { DateTime } from "luxon";

import { hashPassword } from "../src/lib/auth/password";
import { createBooking, type BookingStatus } from "../src/lib/db/bookings";
// The shared client rather than a second `new PrismaClient()`: this script
// writes through lib/db helpers, which hold that singleton, and two clients
// would mean two connection pools racing over the same rows. The
// no-restricted-imports rule (CLAUDE.md rule 1) guards src/** — code that
// serves a request and therefore has a tenant boundary to leak. A build-time
// seed has neither.
import { prisma } from "../src/lib/db/prisma";
import type { Vertical } from "../src/lib/vertical";

// ---------------------------------------------------------------------------
// The spec
// ---------------------------------------------------------------------------

/** Minutes from midnight, tenant-local — the unit WorkingHours stores. */
export function hm(hour: number, minute = 0): number {
  return hour * 60 + minute;
}

/** dayOfWeek: 0 = Sunday .. 6 = Saturday, matching schema.prisma. */
export type WorkingHoursSpec = {
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
};

export type ServiceSpec<ServiceKey extends string> = {
  key: ServiceKey;
  /** German, the canonical name; `nameEn` is what an English visitor sees. */
  name: string;
  nameEn: string;
  durationMinutes: number;
  priceMinorUnits: number;
  category: string;
  categoryEn: string;
};

export type CustomerSpec = { name: string; phone: string; email?: string };

export type Appointment<StaffKey extends string, ServiceKey extends string> = {
  staff: StaffKey;
  /** Minutes from midnight, tenant-local. */
  at: number;
  service: ServiceKey;
  /** Index into the spec's customers. */
  customer: number;
  /** MANUAL is a walk-in the owner typed in at the counter. */
  manual?: boolean;
};

/**
 * Time off, as day offsets from today.
 *
 * A whole-day range ends at the local midnight *after* the last day away —
 * the end instant is exclusive, which is what the display subtracts a day from.
 */
export type TimeOffSpec<StaffKey extends string> = {
  staff: StaffKey;
  reason: string;
} & (
  | /** Whole-day: [first day away, first day back). */
  { wholeDays: { fromOffset: number; toOffset: number }; partDay?: never }
  | /** Part-day: minutes from midnight on one day. */
  { partDay: { offset: number; from: number; to: number }; wholeDays?: never }
);

export type DemoTenantSpec<StaffKey extends string, ServiceKey extends string> = {
  /**
   * Prefixes every fixed id this tenant owns: `{prefix}-staff-…`,
   * `{prefix}-service-…`, `{prefix}-cust-…`, `{prefix}-wh-…`. Those ids are
   * global primary keys, so two demo tenants need two prefixes.
   */
  idPrefix: string;
  /** Used only when the tenant is created; an existing row keeps its id. */
  tenantId: string;
  slug: string;
  /**
   * A slug this tenant had before, so an existing database is renamed in place
   * rather than growing a second demo tenant beside the first.
   */
  legacySlug?: string;
  /** Set on create only — see upsertTenant. */
  timezone: string;
  /** Set on create only, like the timezone. Omitted means the schema default. */
  bufferMinutes?: number;
  businessType: Vertical;
  display: { name: string; address: string; phone: string };
  owner: { email: string; password: string };
  staff: { key: StaffKey; name: string }[];
  /**
   * Per staff member. More than one interval on a day is a break — the same
   * shape the working-hours editor saves.
   */
  workingHours: Record<StaffKey, WorkingHoursSpec[]>;
  services: ServiceSpec<ServiceKey>[];
  customers: CustomerSpec[];
  /** How far either side of today the diary is filled. */
  daysBefore: number;
  daysAfter: number;
  /** Cycled across the fortnight — see replaceBookings. */
  dayTemplates: Appointment<StaffKey, ServiceKey>[][];
  timeOff: TimeOffSpec<StaffKey>[];
};

// ---------------------------------------------------------------------------

/**
 * Seeds one demo tenant and prints what it did.
 *
 * Generic over the spec's staff and service keys, so each entry file keeps its
 * own literal unions and a typo in a day template is a `tsc` error there.
 */
export async function seedDemoTenant<
  StaffKey extends string,
  ServiceKey extends string,
>(spec: DemoTenantSpec<StaffKey, ServiceKey>): Promise<void> {
  const ids = idsFor(spec.idPrefix);

  const tenant = await upsertTenant(spec);
  const owner = await upsertOwner(spec, tenant.id);

  await upsertStaff(spec, ids, tenant.id);
  await upsertServices(spec, ids, tenant.id);

  const cleared = await clearDiary(tenant.id);
  const customerIds = await upsertCustomers(spec, ids, tenant.id);
  const timeOff = await createTimeOff(spec, ids);
  const booked = await replaceBookings(spec, ids, tenant.id, customerIds, timeOff);

  console.log(`Seeded "${tenant.name}"  →  /b/${tenant.slug}`);
  console.log(`  owner      ${owner.email}`);
  console.log(`  staff      ${spec.staff.map((s) => s.name).join(", ")}`);
  console.log(`  services   ${spec.services.length}`);
  console.log(
    `  cleared    ${cleared.bookings} booking(s), ${cleared.customers} customer(s), ${cleared.timeOff} absence(s)`,
  );
  console.log(
    `  time off   ${timeOff.length} upcoming (${spec.timeOff.map((entry) => entry.reason).join(", ")})`,
  );
  console.log(
    `  bookings   ${booked.created} across ${spec.daysBefore} days back and ${spec.daysAfter} forward`,
  );
  console.log(
    `  dropped    ${booked.outsideHours} outside working hours, ${booked.duringTimeOff} during time off`,
  );

  // Loud, because it means the templates and the tenant's buffer disagree and
  // the demo week is thinner than it reads above.
  if (booked.slotTaken > 0) {
    console.warn(
      `\n! ${booked.slotTaken} booking(s) rejected by the overlap constraint.` +
        `\n  The gaps in the day templates are too tight for this tenant's bufferMinutes.`,
    );
  }
  console.log(
    `\nThe password is only set when the owner is first created. Use\n  npm run reset-password ${owner.email}\nto change it.`,
  );
}

/** Runs a seed's main and always closes the shared connection pool. */
export function run(main: () => Promise<void>): void {
  main()
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}

// ---------------------------------------------------------------------------

type Ids = ReturnType<typeof idsFor>;

function idsFor(prefix: string) {
  return {
    staff: (key: string) => `${prefix}-staff-${key}`,
    service: (key: string) => `${prefix}-service-${key}`,
    customer: (index: number) =>
      `${prefix}-cust-${String(index + 1).padStart(2, "0")}`,
    /**
     * The first interval of a day keeps the plain `-{dayOfWeek}` id every
     * pre-existing row was created with, so a single-interval week upserts in
     * place; a second interval (a lunch break) gets `-{dayOfWeek}-2`.
     */
    workingHours: (staffId: string, dayOfWeek: number, nth: number) =>
      `${prefix}-wh-${staffId}-${dayOfWeek}${nth > 1 ? `-${nth}` : ""}`,
    staffPrefix: `${prefix}-staff-`,
    servicePrefix: `${prefix}-service-`,
  };
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
 *
 * `businessType` is written on update too. Nothing in the app edits it, so
 * there is no owner's choice for a re-seed to overwrite.
 */
async function upsertTenant(spec: DemoTenantSpec<string, string>) {
  const display = {
    slug: spec.slug,
    ...spec.display,
    businessType: spec.businessType,
    contactEmail: spec.owner.email,
  };

  const existing =
    (await prisma.tenant.findUnique({ where: { slug: spec.slug } })) ??
    (spec.legacySlug
      ? await prisma.tenant.findUnique({ where: { slug: spec.legacySlug } })
      : null);

  if (existing) {
    return prisma.tenant.update({ where: { id: existing.id }, data: display });
  }

  return prisma.tenant.create({
    data: {
      id: spec.tenantId,
      timezone: spec.timezone,
      ...(spec.bufferMinutes === undefined
        ? {}
        : { bufferMinutes: spec.bufferMinutes }),
      ...display,
    },
  });
}

async function upsertOwner(spec: DemoTenantSpec<string, string>, tenantId: string) {
  const passwordHash = await hashPassword(spec.owner.password);

  return prisma.user.upsert({
    where: { email: spec.owner.email },
    // Deliberately does NOT touch passwordHash on update — re-seeding must not
    // silently undo a password set via scripts/reset-password.ts.
    update: { tenantId },
    create: { tenantId, email: spec.owner.email, passwordHash, role: "OWNER" },
  });
}

/**
 * Staff, their hours, and the cleanup for both.
 *
 * Hours are deleted rather than merely upserted, because the set shrinks: Ivan
 * had a Monday in the pre-Day-13 barbershop seed and doesn't now, and an
 * upsert-only pass would leave that row behind — someone working a day this
 * file says they don't, which the public booking page would faithfully offer.
 *
 * A staff member dropped from the spec entirely is deactivated, never deleted:
 * there is no hard delete for Staff in this product (CLAUDE.md), and existing
 * bookings point at these rows.
 */
async function upsertStaff(
  spec: DemoTenantSpec<string, string>,
  ids: Ids,
  tenantId: string,
) {
  const wantedStaff: string[] = [];

  for (const { key, name } of spec.staff) {
    const id = ids.staff(key);
    wantedStaff.push(id);

    await prisma.staff.upsert({
      where: { id },
      update: { name, active: true },
      create: { id, tenantId, name },
    });

    const seenPerDay = new Map<number, number>();
    const wanted = spec.workingHours[key].map((hours) => {
      const nth = (seenPerDay.get(hours.dayOfWeek) ?? 0) + 1;
      seenPerDay.set(hours.dayOfWeek, nth);
      return { id: ids.workingHours(id, hours.dayOfWeek, nth), ...hours };
    });

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
    where: {
      tenantId,
      id: { startsWith: ids.staffPrefix },
      NOT: { id: { in: wantedStaff } },
    },
    data: { active: false },
  });
}

/** Same deactivate-don't-delete rule as staff, for the same reason. */
async function upsertServices(
  spec: DemoTenantSpec<string, string>,
  ids: Ids,
  tenantId: string,
) {
  const wanted: string[] = [];

  for (const { key, ...service } of spec.services) {
    const id = ids.service(key);
    wanted.push(id);

    await prisma.service.upsert({
      where: { id },
      update: { ...service, active: true },
      create: { id, tenantId, ...service },
    });
  }

  await prisma.service.updateMany({
    where: {
      tenantId,
      id: { startsWith: ids.servicePrefix },
      NOT: { id: { in: wanted } },
    },
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
 * public form, but this script wants the same rows to come back with the same
 * ids on every run so the templates can address them by index.
 */
async function upsertCustomers(
  spec: DemoTenantSpec<string, string>,
  ids: Ids,
  tenantId: string,
): Promise<string[]> {
  const customerIds: string[] = [];

  for (const [index, customer] of spec.customers.entries()) {
    const id = ids.customer(index);
    customerIds.push(id);

    await prisma.customer.upsert({
      where: { id },
      update: customer,
      create: { id, tenantId, ...customer },
    });
  }

  return customerIds;
}

type TimeOffRange = { staffId: string; startAt: Date; endAt: Date };

/** Created fresh every run, because every range is anchored to today. */
async function createTimeOff(
  spec: DemoTenantSpec<string, string>,
  ids: Ids,
): Promise<TimeOffRange[]> {
  const ranges: TimeOffRange[] = [];

  for (const entry of spec.timeOff) {
    const id = ids.staff(entry.staff);

    const { startAt, endAt } = entry.wholeDays
      ? {
          startAt: localDay(spec.timezone, entry.wholeDays.fromOffset).toJSDate(),
          endAt: localDay(spec.timezone, entry.wholeDays.toOffset).toJSDate(),
        }
      : {
          startAt: localTime(spec.timezone, entry.partDay.offset, entry.partDay.from),
          endAt: localTime(spec.timezone, entry.partDay.offset, entry.partDay.to),
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
 * Fixed day tables rather than random generation: a demo that reshuffles itself
 * on every run can't be rehearsed, and a random schedule eventually produces a
 * day that looks wrong (everyone free at 11, or a wall with no gap in it).
 *
 * Entries are filtered at generation time against the staff member's working
 * hours for that weekday and against seeded time off, so one table produces a
 * thin day, a busy day, and nothing at all on a closed day. An entry that
 * doesn't fit is dropped, not moved.
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
  spec: DemoTenantSpec<string, string>,
  ids: Ids,
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
  const templates = spec.dayTemplates;
  const services = new Map(spec.services.map((service) => [service.key, service]));
  let created = 0;
  // Three separate counters, because only one of them is a problem. Dropping an
  // appointment that falls outside someone's hours or inside their holiday is
  // this generator working as designed; a SLOT_TAKEN is the exclusion
  // constraint rejecting an overlap the templates should never have produced.
  // Summed into one number, the third would hide behind the first two.
  let outsideHours = 0;
  let duringTimeOff = 0;
  let slotTaken = 0;

  for (let offset = -spec.daysBefore; offset <= spec.daysAfter; offset++) {
    const day = localDay(spec.timezone, offset);
    const dayOfWeek = day.weekday % 7; // Luxon: 1 = Mon .. 7 = Sun
    const template =
      templates[((offset % templates.length) + templates.length) % templates.length];

    for (const entry of template) {
      const service = services.get(entry.service);
      if (!service) continue;

      const endsAt = entry.at + service.durationMinutes;

      // Outside this person's hours on this weekday — a closed day, a day off,
      // a 17:00 appointment on a Saturday that finishes at 14:00, or one that
      // runs into a lunch break. It has to fit inside a single interval.
      const fits = spec.workingHours[entry.staff].some(
        (row) =>
          row.dayOfWeek === dayOfWeek &&
          entry.at >= row.startMinute &&
          endsAt <= row.endMinute,
      );
      if (!fits) {
        outsideHours++;
        continue;
      }

      const id = ids.staff(entry.staff);
      const startAt = localTime(spec.timezone, offset, entry.at);
      // Who sits in this chair rotates by the day, so the same customer doesn't
      // land in the same slot every time the templates come round again —
      // which is what a fortnight of repeating days otherwise looks like on the
      // week view.
      //
      // It also spreads the load across phone numbers, which matters because the
      // public form's rate limiter counts a customer's *upcoming* bookings.
      // Measured on the barbershop demo: 4 upcoming on the busiest seeded
      // number, against a limit of 5. Comfortable but not enormous — so demo the
      // booking flow with a real phone number, not one of the seeded ones.
      // (Every seeded booking also shares one createdAt, so for an hour after
      // seeding all the seeded numbers are over the separate "3 bookings in 60
      // minutes" limit.)
      const customer =
        customerIds[
          (((entry.customer + offset) % customerIds.length) + customerIds.length) %
            customerIds.length
        ];
      const endAtInstant = localTime(spec.timezone, offset, endsAt);

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
        serviceId: ids.service(entry.service),
        customerId: customer,
        startAt,
        source: entry.manual ? "MANUAL" : "ONLINE",
      });

      // The exclusion constraint rejected it — reachable if the tenant's buffer
      // has been raised past the gaps in the templates. Counted and reported
      // rather than thrown: the rest of the week is still worth having.
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
 * same person or the same hour every time.
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

/**
 * Midnight, tenant-local, `offset` days from today.
 *
 * Luxon rather than raw Date arithmetic, and `plus({ days })` on a local
 * midnight rather than adding 24 hours: across a DST boundary a local day is 23
 * or 25 hours long, and the difference is a whole day's appointments landing an
 * hour out.
 */
function localDay(timezone: string, offset: number): DateTime {
  return DateTime.now().setZone(timezone).startOf("day").plus({ days: offset });
}

/** A wall-clock time on one of those days, as the UTC instant to store. */
function localTime(timezone: string, offset: number, minuteOfDay: number): Date {
  return localDay(timezone, offset)
    .set({ hour: Math.floor(minuteOfDay / 60), minute: minuteOfDay % 60 })
    .toJSDate();
}
