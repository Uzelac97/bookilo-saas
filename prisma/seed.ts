/**
 * The barbershop demo tenant: a shop that looks like a real shop.
 *
 *   npm run db:seed
 *
 * It seeds a full week of appointments either side of today rather than an
 * empty diary — a calendar with nothing in it demonstrates nothing, and the
 * density tiers, the week view, the overview's takings and the "fully booked"
 * empty state all need real rows to have anything to say. Re-running it
 * re-anchors that week to the current date, which makes this the reset button.
 *
 * This file is data. The machinery — what a re-run destroys and what it leaves
 * alone, the id scheme, and why bookings go through createBooking — lives in
 * seed-demo-tenant.ts, shared with the salon demo in seed-salon.ts.
 */
import {
  hm,
  run,
  seedDemoTenant,
  type Appointment,
  type CustomerSpec,
  type ServiceSpec,
  type TimeOffSpec,
  type WorkingHoursSpec,
} from "./seed-demo-tenant";

// ---------------------------------------------------------------------------
// The shop
// ---------------------------------------------------------------------------

/**
 * Fixed id for a fresh database. An existing row keeps whatever id it has —
 * see LEGACY_SLUG for why that can differ.
 */
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
const WORKING_HOURS: Record<StaffKey, WorkingHoursSpec[]> = {
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
 * only way to see them behave: at 80px an hour, "Konturen" (15 min) renders at
 * 20px and "Maschinenhaarschnitt"/"Bart trimmen" (20 min) at 27px — the
 * `minimal` tier, one line of text — while a 45-minute fade gets the full
 * three. Nothing here reaches `sliver` (under 13px, i.e. under 10 minutes), and
 * that is honest: no barbershop sells a 5-minute appointment.
 *
 * `name` is German, the canonical name every German surface shows; `nameEn`
 * is for an English visitor and for the English marketing page, which finds
 * its featured services by it.
 *
 * Categories are rendered in the order getActiveServices returns them, which is
 * alphabetical by the German label — Haarschnitte, Pakete, Rasur & Bart — and
 * that order holds in English too.
 */
const SERVICES: ServiceSpec<ServiceKey>[] = [
  { key: "haircut", name: "Haarschnitt", nameEn: "Haircut", durationMinutes: 35, priceMinorUnits: 3200, category: "Haarschnitte", categoryEn: "Haircuts" },
  { key: "fade", name: "Skin Fade", nameEn: "Skin fade", durationMinutes: 45, priceMinorUnits: 3800, category: "Haarschnitte", categoryEn: "Haircuts" },
  { key: "buzz", name: "Maschinenhaarschnitt", nameEn: "Buzz cut", durationMinutes: 20, priceMinorUnits: 2200, category: "Haarschnitte", categoryEn: "Haircuts" },
  { key: "lineup", name: "Konturen", nameEn: "Line-up", durationMinutes: 15, priceMinorUnits: 1200, category: "Haarschnitte", categoryEn: "Haircuts" },
  { key: "kids", name: "Kinderhaarschnitt (bis 12)", nameEn: "Kids cut (under 12)", durationMinutes: 25, priceMinorUnits: 2200, category: "Haarschnitte", categoryEn: "Haircuts" },
  { key: "beard", name: "Bart trimmen", nameEn: "Beard trim", durationMinutes: 20, priceMinorUnits: 1800, category: "Rasur & Bart", categoryEn: "Shaving & beard" },
  { key: "shave", name: "Nassrasur mit heißem Tuch", nameEn: "Hot towel shave", durationMinutes: 40, priceMinorUnits: 3400, category: "Rasur & Bart", categoryEn: "Shaving & beard" },
  { key: "combo", name: "Haarschnitt & Bart", nameEn: "Cut & beard", durationMinutes: 60, priceMinorUnits: 4600, category: "Pakete", categoryEn: "Packages" },
  { key: "works", name: "Das volle Programm", nameEn: "The full works", durationMinutes: 75, priceMinorUnits: 5800, category: "Pakete", categoryEn: "Packages" },
];

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
const CUSTOMERS: CustomerSpec[] = [
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

// ---------------------------------------------------------------------------
// The week
// ---------------------------------------------------------------------------

/** How far either side of today the diary is filled. */
const DAYS_BEFORE = 7;
const DAYS_AFTER = 7;

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
const DAY_TEMPLATES: Appointment<StaffKey, ServiceKey>[][] = [
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
const TIME_OFF: TimeOffSpec<StaffKey>[] = [
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

run(() =>
  seedDemoTenant({
    // "seed" rather than something more specific because it is what every id
    // this tenant owns was created with before a second demo existed. Changing
    // it would re-create every row under a new id instead of upserting in place.
    idPrefix: "seed",
    tenantId: TENANT_ID,
    slug: SLUG,
    legacySlug: LEGACY_SLUG,
    timezone: TIMEZONE,
    businessType: "BARBERSHOP",
    display: {
      name: "Kastanien Barbershop",
      address: "Königstraße 12, 70173 Stuttgart",
      phone: "+49 711 4401278",
    },
    owner: { email: OWNER_EMAIL, password: OWNER_PASSWORD },
    staff: STAFF,
    workingHours: WORKING_HOURS,
    services: SERVICES,
    customers: CUSTOMERS,
    daysBefore: DAYS_BEFORE,
    daysAfter: DAYS_AFTER,
    dayTemplates: DAY_TEMPLATES,
    timeOff: TIME_OFF,
  }),
);
