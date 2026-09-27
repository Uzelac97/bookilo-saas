/**
 * The hair salon demo tenant — the second vertical, on the same code.
 *
 *   npm run db:seed:salon
 *
 * Same shape as seed.ts and the same machinery (seed-demo-tenant.ts): a
 * fortnight of appointments either side of today, re-anchored on every run.
 * What differs is only what differs between a barbershop and a salon —
 * `businessType: "SALON"`, which switches the interface to salon wording, and
 * the data below. If a salon ever needs more than that, it has stopped being
 * the same product (EXECUTION-PLAN.md, "which industries this product serves").
 */
import { DateTime } from "luxon";

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
// The salon
// ---------------------------------------------------------------------------

const TENANT_ID = "seed-tenant-salon";
const SLUG = "salon-linde";
const TIMEZONE = "Europe/Berlin";

/**
 * Its own login: User.email is unique across every tenant, so the two demos
 * can't share an owner address.
 */
const OWNER_EMAIL = (process.env.SEED_SALON_OWNER_EMAIL ?? "salon-owner@demo.test")
  .trim()
  .toLowerCase();
const OWNER_PASSWORD = process.env.SEED_SALON_OWNER_PASSWORD ?? "demo-password-123";

/**
 * Ten minutes to sweep up and reset the chair between clients, which a salon
 * working with colour and long hair generally needs. Set on create only, like
 * the timezone — it's owner-editable, and the day templates below leave at
 * least this much between one client's end and the next one's start.
 */
const BUFFER_MINUTES = 10;

// ---------------------------------------------------------------------------
// Staff
// ---------------------------------------------------------------------------

type StaffKey = "sabine" | "lena" | "aylin" | "tom";

const STAFF: { key: StaffKey; name: string }[] = [
  { key: "sabine", name: "Sabine Hartmann" },
  { key: "lena", name: "Lena Wagner" },
  { key: "aylin", name: "Aylin Çelik" },
  { key: "tom", name: "Tom Berger" },
];

/**
 * Closed Monday and Sunday, the usual week for a German salon — and the mirror
 * of the barbershop demo, where Monday is merely thin. As there, "closed" is
 * nothing but the absence of anyone's hours.
 *
 * Two shapes the barbershop demo doesn't have:
 *
 * - Sabine takes a lunch hour: two intervals on each weekday. The public page's
 *   opening hours are the union across the team, so her break doesn't show
 *   there — Lena is in over it — but her calendar column and her slots do.
 * - Lena works a late Thursday (until 20:00), the traditional long evening.
 *
 * dayOfWeek: 0 = Sunday .. 6 = Saturday, matching schema.prisma.
 */
const WORKING_HOURS: Record<StaffKey, WorkingHoursSpec[]> = {
  // Owner and master hairdresser. Early Saturday.
  sabine: [
    ...[2, 3, 4, 5].flatMap((dayOfWeek) => [
      { dayOfWeek, startMinute: hm(9), endMinute: hm(13) },
      { dayOfWeek, startMinute: hm(14), endMinute: hm(18) },
    ]),
    { dayOfWeek: 6, startMinute: hm(8), endMinute: hm(14) },
  ],
  // Full-time, late Thursday.
  lena: [
    ...[2, 3, 5].map((dayOfWeek) => ({
      dayOfWeek,
      startMinute: hm(10),
      endMinute: hm(19),
    })),
    { dayOfWeek: 4, startMinute: hm(10), endMinute: hm(20) },
    { dayOfWeek: 6, startMinute: hm(9), endMinute: hm(15) },
  ],
  // Part-time colour specialist, midweek.
  aylin: [3, 4, 5].map((dayOfWeek) => ({
    dayOfWeek,
    startMinute: hm(9),
    endMinute: hm(17),
  })),
  // Part-time, mostly men's cuts, evenings and Saturday morning.
  tom: [
    { dayOfWeek: 2, startMinute: hm(12), endMinute: hm(20) },
    { dayOfWeek: 5, startMinute: hm(12), endMinute: hm(20) },
    { dayOfWeek: 6, startMinute: hm(9), endMinute: hm(14) },
  ],
};

// ---------------------------------------------------------------------------
// Services
// ---------------------------------------------------------------------------

type ServiceKey =
  | "wsf"
  | "spitzen"
  | "foehnen"
  | "ansatz"
  | "straehnen"
  | "balayage"
  | "glossing"
  | "herren"
  | "kinder"
  | "kur"
  | "hochsteck"
  | "wimpern";

/**
 * A mid-range salon's price list, in German because it is the salon's own
 * text rather than the interface's. Prices in EUR cents, illustrative rather
 * than calibrated to any one market.
 *
 * Wider durations than the barbershop's — 15 minutes to three hours — so the
 * calendar gets both ends: a Haarkur at the `minimal` tier and a balayage block
 * that fills most of a morning.
 *
 * Every colour service is booked for its full length. In a real salon the
 * stylist takes another client while colour develops; this product has no way
 * to express that, and EXECUTION-PLAN.md records it as a known gap rather than
 * this file pretending otherwise.
 *
 * Categories are rendered in the order getActiveServices returns them, which is
 * alphabetical by the German label — Damen, Farbe & Strähnen, Herren & Kinder,
 * Pflege & Styling. English keeps that order, so its groups aren't alphabetical.
 */
const SERVICES: ServiceSpec<ServiceKey>[] = [
  { key: "wsf", name: "Waschen, Schneiden, Föhnen", nameEn: "Wash, cut & blow-dry", durationMinutes: 60, priceMinorUnits: 5800, category: "Damen", categoryEn: "Women" },
  { key: "spitzen", name: "Spitzen schneiden & Föhnen", nameEn: "Trim & blow-dry", durationMinutes: 45, priceMinorUnits: 4200, category: "Damen", categoryEn: "Women" },
  { key: "foehnen", name: "Waschen & Föhnen", nameEn: "Wash & blow-dry", durationMinutes: 30, priceMinorUnits: 2900, category: "Damen", categoryEn: "Women" },
  { key: "ansatz", name: "Ansatzfarbe inkl. Föhnen", nameEn: "Root colour incl. blow-dry", durationMinutes: 90, priceMinorUnits: 7200, category: "Farbe & Strähnen", categoryEn: "Colour & highlights" },
  { key: "straehnen", name: "Foliensträhnen Oberkopf inkl. Föhnen", nameEn: "Foil highlights (crown) incl. blow-dry", durationMinutes: 120, priceMinorUnits: 9800, category: "Farbe & Strähnen", categoryEn: "Colour & highlights" },
  { key: "balayage", name: "Balayage inkl. Schnitt & Föhnen", nameEn: "Balayage incl. cut & blow-dry", durationMinutes: 180, priceMinorUnits: 18900, category: "Farbe & Strähnen", categoryEn: "Colour & highlights" },
  { key: "glossing", name: "Glossing", nameEn: "Gloss treatment", durationMinutes: 40, priceMinorUnits: 3900, category: "Farbe & Strähnen", categoryEn: "Colour & highlights" },
  { key: "herren", name: "Herrenhaarschnitt", nameEn: "Men's cut", durationMinutes: 30, priceMinorUnits: 3200, category: "Herren & Kinder", categoryEn: "Men & kids" },
  { key: "kinder", name: "Kinderhaarschnitt (bis 10 Jahre)", nameEn: "Kids' cut (up to 10)", durationMinutes: 25, priceMinorUnits: 1900, category: "Herren & Kinder", categoryEn: "Men & kids" },
  { key: "kur", name: "Intensiv-Haarkur", nameEn: "Intensive hair treatment", durationMinutes: 15, priceMinorUnits: 1500, category: "Pflege & Styling", categoryEn: "Care & styling" },
  { key: "hochsteck", name: "Hochsteckfrisur", nameEn: "Updo", durationMinutes: 60, priceMinorUnits: 6500, category: "Pflege & Styling", categoryEn: "Care & styling" },
  { key: "wimpern", name: "Wimpern & Brauen färben", nameEn: "Lash & brow tint", durationMinutes: 20, priceMinorUnits: 1900, category: "Pflege & Styling", categoryEn: "Care & styling" },
];

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------

/**
 * Canonical phone form, for the reason given in seed.ts: phone is the tenant's
 * identity key for a customer. A separate block from the barbershop's (…001xx
 * rather than …000xx) — not required, since customers are per tenant, but it
 * keeps a phone number found in a log unambiguous about which demo it's from.
 * Addresses on example.com (RFC 2606), so nothing here can reach a real person.
 */
const CUSTOMERS: CustomerSpec[] = [
  { name: "Anna Schmid", phone: "+4915155500101", email: "anna.schmid@example.com" },
  { name: "Katharina Maier", phone: "+4915155500102" },
  { name: "Elif Arslan", phone: "+4915155500103", email: "elif.arslan@example.com" },
  { name: "Sophie Keller", phone: "+4915155500104" },
  { name: "Laura Zimmermann", phone: "+4915155500105", email: "laura.zimmermann@example.com" },
  { name: "Selin Öztürk", phone: "+4915155500106" },
  { name: "Marie Schulz", phone: "+4915155500107", email: "marie.schulz@example.com" },
  { name: "Stefan Weiß", phone: "+4915155500108" },
  { name: "Ana Petrović", phone: "+4915155500109", email: "ana.petrovic@example.com" },
  { name: "Hannah Koch", phone: "+4915155500110" },
  { name: "Franziska Lang", phone: "+4915155500111", email: "franziska.lang@example.com" },
  { name: "Lea Richter", phone: "+4915155500112" },
  { name: "Daniel Maurer", phone: "+4915155500113", email: "daniel.maurer@example.com" },
  { name: "Nina Bauer", phone: "+4915155500114" },
  { name: "Carina Huber", phone: "+4915155500115", email: "carina.huber@example.com" },
  { name: "Mia Schäfer", phone: "+4915155500116" },
  { name: "Giulia Romano", phone: "+4915155500117", email: "giulia.romano@example.com" },
  { name: "Jana Vogel", phone: "+4915155500118" },
  { name: "Sarah Klein", phone: "+4915155500119", email: "sarah.klein@example.com" },
  { name: "Tim Albrecht", phone: "+4915155500120" },
];

// ---------------------------------------------------------------------------
// The week
// ---------------------------------------------------------------------------

const DAYS_BEFORE = 7;
const DAYS_AFTER = 7;

/**
 * Six days of appointments, cycled across the fortnight, with holes left in
 * every day so there is always something to book.
 *
 * Same filtering as the barbershop's: an entry outside that person's hours on
 * the weekday it lands on is dropped. So the 08:00 and 08:30 starts only
 * survive on a Saturday (Sabine's early day), Lena's 09:30 likewise, nothing
 * lands on Monday or Sunday, and no appointment of Sabine's crosses her lunch
 * hour — the generator requires an appointment to fit inside one interval, the
 * same rule computeSlots applies to a real customer.
 *
 * Gaps between one person's appointments are at least BUFFER_MINUTES, or the
 * overlap constraint rejects the second and the seed says so loudly.
 */
const DAY_TEMPLATES: Appointment<StaffKey, ServiceKey>[][] = [
  [
    { staff: "sabine", at: hm(9), service: "wsf", customer: 0 },
    { staff: "sabine", at: hm(10, 30), service: "ansatz", customer: 1 },
    { staff: "sabine", at: hm(14, 30), service: "herren", customer: 7, manual: true },
    { staff: "sabine", at: hm(16), service: "spitzen", customer: 2 },
    { staff: "lena", at: hm(10), service: "balayage", customer: 3 },
    { staff: "lena", at: hm(14), service: "spitzen", customer: 4 },
    { staff: "lena", at: hm(16), service: "hochsteck", customer: 5 },
    { staff: "aylin", at: hm(9, 30), service: "straehnen", customer: 6 },
    { staff: "aylin", at: hm(13), service: "glossing", customer: 8 },
    { staff: "aylin", at: hm(15), service: "wimpern", customer: 9 },
    { staff: "tom", at: hm(12, 30), service: "herren", customer: 12 },
    { staff: "tom", at: hm(13, 30), service: "kinder", customer: 10 },
    { staff: "tom", at: hm(17), service: "foehnen", customer: 11 },
  ],
  [
    { staff: "sabine", at: hm(9, 30), service: "spitzen", customer: 13 },
    { staff: "sabine", at: hm(11), service: "wsf", customer: 14 },
    { staff: "sabine", at: hm(12, 15), service: "kur", customer: 14, manual: true },
    { staff: "sabine", at: hm(14), service: "ansatz", customer: 15 },
    { staff: "lena", at: hm(10, 30), service: "wsf", customer: 16 },
    { staff: "lena", at: hm(12), service: "straehnen", customer: 17 },
    { staff: "lena", at: hm(16, 30), service: "foehnen", customer: 18 },
    { staff: "lena", at: hm(18), service: "herren", customer: 19 },
    { staff: "aylin", at: hm(9), service: "ansatz", customer: 0 },
    { staff: "aylin", at: hm(11, 30), service: "balayage", customer: 1 },
    { staff: "tom", at: hm(13), service: "herren", customer: 7 },
    { staff: "tom", at: hm(15), service: "wsf", customer: 2 },
    { staff: "tom", at: hm(18, 30), service: "herren", customer: 12 },
  ],
  [
    { staff: "sabine", at: hm(8, 30), service: "foehnen", customer: 3 },
    { staff: "sabine", at: hm(10), service: "straehnen", customer: 4 },
    { staff: "sabine", at: hm(15), service: "wsf", customer: 5 },
    { staff: "lena", at: hm(10), service: "spitzen", customer: 6 },
    { staff: "lena", at: hm(11, 30), service: "ansatz", customer: 8 },
    { staff: "lena", at: hm(15, 30), service: "wsf", customer: 9 },
    { staff: "lena", at: hm(17, 30), service: "wimpern", customer: 10, manual: true },
    { staff: "aylin", at: hm(10), service: "glossing", customer: 11 },
    { staff: "aylin", at: hm(13, 30), service: "wsf", customer: 13 },
    { staff: "tom", at: hm(12), service: "kinder", customer: 14 },
    { staff: "tom", at: hm(14), service: "herren", customer: 19 },
    { staff: "tom", at: hm(16, 30), service: "spitzen", customer: 15 },
  ],
  [
    { staff: "sabine", at: hm(9), service: "balayage", customer: 16 },
    { staff: "sabine", at: hm(14), service: "kur", customer: 17, manual: true },
    { staff: "sabine", at: hm(15), service: "herren", customer: 12 },
    { staff: "lena", at: hm(11), service: "wsf", customer: 18 },
    { staff: "lena", at: hm(13), service: "hochsteck", customer: 0 },
    { staff: "lena", at: hm(17), service: "straehnen", customer: 1 },
    { staff: "aylin", at: hm(9, 30), service: "wsf", customer: 2 },
    { staff: "aylin", at: hm(12), service: "ansatz", customer: 3 },
    { staff: "aylin", at: hm(15, 30), service: "wimpern", customer: 4 },
    { staff: "tom", at: hm(12, 30), service: "wsf", customer: 5 },
    { staff: "tom", at: hm(16), service: "herren", customer: 7 },
    { staff: "tom", at: hm(19), service: "herren", customer: 19 },
  ],
  [
    { staff: "sabine", at: hm(10), service: "wsf", customer: 6 },
    { staff: "sabine", at: hm(11, 30), service: "glossing", customer: 8 },
    { staff: "sabine", at: hm(16, 30), service: "herren", customer: 12 },
    { staff: "lena", at: hm(10), service: "ansatz", customer: 9 },
    { staff: "lena", at: hm(13, 30), service: "balayage", customer: 10 },
    { staff: "lena", at: hm(17), service: "foehnen", customer: 11 },
    { staff: "aylin", at: hm(11), service: "straehnen", customer: 13 },
    { staff: "aylin", at: hm(14), service: "spitzen", customer: 14, manual: true },
    { staff: "tom", at: hm(12), service: "herren", customer: 7 },
    { staff: "tom", at: hm(14, 30), service: "kinder", customer: 15 },
    { staff: "tom", at: hm(17, 30), service: "wsf", customer: 16 },
  ],
  [
    { staff: "sabine", at: hm(8), service: "wsf", customer: 17 },
    { staff: "sabine", at: hm(9, 30), service: "hochsteck", customer: 18 },
    { staff: "sabine", at: hm(11), service: "herren", customer: 19 },
    { staff: "sabine", at: hm(14, 30), service: "spitzen", customer: 0 },
    { staff: "lena", at: hm(9, 30), service: "foehnen", customer: 1 },
    { staff: "lena", at: hm(11), service: "wsf", customer: 2 },
    { staff: "lena", at: hm(12, 30), service: "wimpern", customer: 3 },
    { staff: "lena", at: hm(15), service: "ansatz", customer: 4 },
    { staff: "aylin", at: hm(9), service: "kur", customer: 5 },
    { staff: "aylin", at: hm(10), service: "wsf", customer: 6 },
    { staff: "aylin", at: hm(13), service: "straehnen", customer: 8 },
    { staff: "tom", at: hm(12), service: "foehnen", customer: 9, manual: true },
    { staff: "tom", at: hm(13), service: "herren", customer: 12 },
    { staff: "tom", at: hm(18), service: "kinder", customer: 10 },
  ],
];

/**
 * One whole-day absence and one part-day, for the same reason as the
 * barbershop's: the staff screen renders the two shapes differently. Both in
 * the future, since that screen hides an absence once it has finished.
 */
const TIME_OFF: TimeOffSpec<StaffKey>[] = [
  {
    staff: "lena",
    reason: "Urlaub",
    wholeDays: { fromOffset: 8, toOffset: 13 },
  },
  {
    staff: "aylin",
    reason: "Fortbildung",
    // Her next Thursday rather than a fixed offset: she works three days a
    // week, so "two days from now" would usually land on a day she's off
    // anyway, and an absence on a day off shows nothing.
    partDay: { offset: daysUntilNext(4, 1), from: hm(13), to: hm(17) },
  },
];

/**
 * Days from today, tenant-local, to the next `dayOfWeek` (0 = Sunday) that is
 * at least `min` days away. Luxon's weekday is 1 = Mon .. 7 = Sun, hence % 7.
 */
function daysUntilNext(dayOfWeek: number, min: number): number {
  const today = DateTime.now().setZone(TIMEZONE).weekday % 7;
  let offset = (dayOfWeek - today + 7) % 7;
  while (offset < min) offset += 7;
  return offset;
}

// ---------------------------------------------------------------------------

run(() =>
  seedDemoTenant({
    idPrefix: "seed-salon",
    tenantId: TENANT_ID,
    slug: SLUG,
    timezone: TIMEZONE,
    bufferMinutes: BUFFER_MINUTES,
    businessType: "SALON",
    display: {
      name: "Salon Linde",
      address: "Tübinger Straße 41, 70178 Stuttgart",
      phone: "+49 711 6072214",
      heroImageUrl: "/salon-linde/hero.jpg",
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
