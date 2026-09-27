# Execution Plan — Bookilo (MVP)

Booking for barbershops and hair salons. Solo developer, Claude Code-assisted,
Next.js/TypeScript/Prisma/PostgreSQL/Tailwind/Vercel.
Companion files: `schema.prisma`, `CLAUDE.md`, `V1-LAUNCH-PLAN.md`.

The repository and the Vercel project are both named `bookilo-saas`; production data
lives in the Neon project `bookilo-prod`, separate from the development one. None of
it is user-facing. This reverses the original "keep the `barber-saas` name" decision —
recorded as a correction under "A naming decision that was reversed outside the plan"
below rather than silently updated.

This is the **final** scope. Where I cut something from the earlier strategy draft, I've said so and why — the instruction was to be critical, so I went back and removed a few things that didn't earn their place yet.

---

## 1. Final MVP Scope

### What gets built

| Area            | Included                                                                                                                                                                                                                                              |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public booking  | Tenant booking page at `/b/{slug}`, service list, live slot picker, booking form (name, phone, optional email), confirmation screen                                                                                                                   |
| Booking engine  | Concurrency-safe slot booking (Postgres exclusion constraint), buffer time, minimum lead time, cancellation window                                                                                                                                    |
| Cancellation    | Token-based cancel link, no customer account                                                                                                                                                                                                          |
| Owner auth      | Email + password login (Auth.js v5, Credentials, JWT sessions) — one owner account per tenant                                                                                                                                                         |
| Owner dashboard | Day/week calendar, manual booking entry (walk-ins), services CRUD, staff CRUD (including each staff member's working hours and their time off), settings (buffer, lead time, cancellation window)                                                     |
| Notifications   | Email only (Resend): booking confirmation to customer, new-booking alert to owner                                                                                                                                                                     |
| Tenancy         | Single business per tenant, generalist staff (any active barber can take any active service). Opening hours are per-staff (`WorkingHours`) — there is no separate business-level hours field; "closed Sunday" simply means no staff has Sunday hours. |

### What's explicitly cut from the earlier draft, and why

- **No `Location` model.** Every target customer (1–5 chair barbershop) has exactly one location. Address/timezone live directly on `Tenant`; opening hours live per staff member (`WorkingHours`), not on `Tenant`. Adding a `Location` table later, when you actually sell to a second location, is a small additive migration — not a rebuild. Building it now is speculative.
- **No `StaffService` mapping table.** Unlike hair salons, barbershops are generally staffed by generalists — any active barber can perform any active service. This removes an entire join table, an entire admin UI, and a whole class of "which staff can do this" logic from the booking flow. If a real customer later needs staff-service restrictions, it's one additive table plus a filter in the availability query — not architecture surgery.
- **`Service.category` is a plain optional string**, not a separate taxonomy table. It exists only to group services visually on the booking page.
- **No staff self-login.** Staff are managed by the owner; they don't have accounts yet. The `User.role` enum already includes `STAFF` so this is a Phase 2 feature addition, not a data-model change.

### What's excluded entirely for now

Staff login, SMS/WhatsApp reminders, deposits/payments, multi-location,
analytics dashboard, customer accounts, ~~i18n~~, recurring/subscription
bookings, reviews or any marketplace surface, POS/inventory, granular
permissions beyond Owner/Staff, `Resource`/rooms/bays/equipment, any
vertical beyond barber shops and hair salons, custom domains, wildcard
subdomains.

**Correction — `i18n` was reversed on 13 Aug 2026 and is now near-term rather
than excluded.** Struck in place rather than deleted, same as the Day 1
corrections and the `barber-saas` → `bookilo-saas` rename further down: this
entry was wrong about the product's actual market, and a list that quietly drops
its own mistakes stops being a record of what was decided. It now runs as Phase
15a, immediately after the security audit and *before* the salon vertical. The
full entry, with the cost it accepts, is in "Decisions recorded after 14.3"
below. Everything else on this list stands unchanged.

### Standing boundary: per-tenant customization vs. custom development

Decided early, deliberately, so it's not renegotiated live under pressure from an eager first customer.

**Unbounded and already supported, no architecture change needed:** how many services, categories, staff members, and how long the descriptions are. A tenant with 5 services and one with 40 already hit the same `Service` table and the same `service-list.tsx` component — more data, not different code.

**Safe to add later, cheap, same additive pattern as `Location`/`StaffService` being deferred from the MVP:** logo, one or two brand colors, a photo gallery, staff bios/headshots. A small number of nullable `Tenant` columns (or one small table), rendered in a fixed spot in the shared template. Build when a real customer asks, not speculatively.

**The line that must not move: every tenant renders through the same components and the same layout, always.** Bounded content and branding variation, yes. Structural variation — a different arrangement of sections, a new section type invented per customer, custom CSS — no. If a real prospect's actual ask is custom layout, that's a signal they're outside this product's target customer (independent shops with no website today, not design-opinionated clients), not a feature gap to close. The moment layout varies per tenant, this stops being a flat-fee SaaS product with zero marginal cost per customer and becomes a web design agency with a booking feature bolted on.

If bounded optional sections (About, Gallery, Testimonials, Team) are ever built, they're a fixed menu of block _types_ a tenant can toggle on/off and fill with content — never an open-ended page builder.

### Standing boundary: which industries this product serves

Decided after drafting — and rejecting — an architecture for a generic
multi-vertical platform (barbers, beauty, auto repair, dental, physio, pet
grooming, etc.). Recorded here because the pull toward it is strong and
recurring, and because the reasoning against it isn't obvious.

**The target is barber shops and hair salons. Nothing else.** They share the
workflow this product is built around: staff with individual calendars,
service-duration slots, walk-ins, regulars, no resource booking, no
inventory. Serving both costs nothing — the data model is already identical.

**What differs between them is terminology, branding and seed data. Never
structure.** A `vertical` field on `Tenant` plus a label map is the entire
mechanism. Internal names stay generic (`Staff`, `Service`, `Booking`);
only owner-facing strings change.

**Why the generic platform was rejected.** The differentiator over Fresha and
Shore is that this product is _not_ generic — that is the entire wedge.
Every incumbent already owns the "any appointment business" position with
far more resources. More concretely: the verticals that look like a config
change aren't one. Auto repair and beauty need a `Resource` entity (bays,
treatment rooms), which reopens the exclusion constraint — the most
correctness-dense thing in the codebase. Dental and physio are regulated
health data under GDPR, which is a liability decision rather than a seed
file. The "one codebase, config only" thesis holds for terminology and
breaks exactly where each vertical's actual value lives.

**What would make this live again:** a paying barber or salon customer, and
evidence from real conversations that an adjacent vertical wants the same
product. Not a hypothesis about market size.

---

## 2. Database Schema

See `schema.prisma` for the actual file. Summary of the model:

```
Tenant 1─* Staff
Tenant 1─* Service
Tenant 1─* Customer
Tenant 1─* Booking
Tenant 1─* User (owner account)
Staff   1─* WorkingHours
Staff   1─* TimeOff
Staff   1─* Booking
Service 1─* Booking
Customer 1─* Booking
```

The one piece Prisma can't express natively: the **overlap-prevention exclusion constraint** on `Booking`. This has to be added as raw SQL in a migration, same approach you already validated in the previous project (a `PrismaClientUnknownRequestError` with SQLSTATE `23P01` is the expected signal for a conflict — worth re-adding the probe-script step before you rely on it). See the note at the bottom of `schema.prisma`.

---

## 3. Application Architecture

**Rendering/data flow:** Server Actions for all mutations and most data fetching. No separate REST API layer for the first-party frontend — you don't have an external consumer yet, so a parallel API surface is pure overhead. Add a Route Handler only where something _outside_ your own app needs to call in (a future Stripe webhook is the first realistic case).

**Tenant resolution, two paths, never mixed:**

- Public routes (`/b/[slug]`) resolve the tenant from the URL slug, server-side, on every request.
- Dashboard routes resolve the tenant from the authenticated session (`session.tenantId`). A dashboard mutation must never accept a client-supplied `tenantId` — it always comes from the server-side session.

**Tenant-scoped data access layer:** every query that touches tenant-owned data goes through `lib/db/*`, where each function requires `tenantId` as a parameter and bakes it into the `where` clause. Components and server actions never call `prisma.booking.findMany(...)` directly — they call `getBookingsForTenant(tenantId, ...)`. This is the single structural guardrail against cross-tenant data leaks, and it's cheap to enforce if you do it from day one and expensive to retrofit later.

**Auth:** Auth.js v5, Credentials provider, JWT session strategy (no `Account`/`Session` tables needed — one less thing to manage). Session payload: `{ userId, tenantId, role }`. `proxy.ts` protects everything under `/dashboard`. Email is globally unique across the whole app for MVP — one email maps to exactly one tenant, so there's no multi-tenant-per-user complexity to handle yet.

**Availability computation:** a single module (`lib/availability/slots.ts`) takes a tenant's settings, a staff member's working hours + time-off, and existing bookings with status `CONFIRMED` or `COMPLETED` (the identical set the exclusion constraint protects — see `schema.prisma`), and returns open slots for a given date, using Luxon for timezone-safe math. This is the most logic-dense part of the app — keep it a pure function, easy to unit test, no side effects.

---

## 4. Folder Structure

```
/prisma
  schema.prisma
  /migrations

/src
  /app
    /(public)
      /b/[slug]
        page.tsx              # business page + service list
        /book
          page.tsx             # booking flow (client component, calls server actions)
        /cancel/[token]
          page.tsx
    /(dashboard)
      layout.tsx                # auth guard + shell
      /dashboard
        page.tsx                 # today/overview
        /calendar
          page.tsx
        /services
          page.tsx
        /staff
          page.tsx
        /settings
          page.tsx
    /login
      page.tsx
    layout.tsx
    globals.css

  /lib
    /db
      tenant.ts                 # tenant-scoped helpers (non-negotiable entry point)
      bookings.ts
      staff.ts
      services.ts
      customers.ts
    /auth
      auth.config.ts             # dependency-free config, imported by proxy.ts
      auth.ts                    # full config incl. Prisma-backed Credentials authorize (Node runtime only)
      session.ts                # getCurrentTenant()/getCurrentUser() helpers
    /availability
      slots.ts                  # pure slot-computation logic
    /email
      resend.ts
      templates/
        booking-confirmation.tsx
        owner-notification.tsx
    /validation
      booking.ts                # zod schemas
      service.ts
      staff.ts

  /components
    /booking                    # public flow: ServiceList, SlotPicker, BookingForm
    /dashboard                  # Calendar, BookingList, ServiceForm, StaffForm
    /ui                          # shared primitives (Button, Input, Card, etc.)

  proxy.ts

CLAUDE.md
AGENTS.md         # one-line pointer at CLAUDE.md — this project uses Claude Code only,
                   # don't let two rules files exist and drift
SPEC.md          # (this file + schema doubles as your source of truth)
```

---

## 5. Development Phases

| Phase                         | Goal                                                                                             |
| ----------------------------- | ------------------------------------------------------------------------------------------------ |
| **0 — Foundation**            | Schema, migrations, exclusion constraint, auth, tenant scoping, deploy pipeline live             |
| **1 — Booking Core**          | Public booking flow end-to-end: browse → pick slot → book → email confirmation → cancel          |
| **2 — Owner Dashboard**       | Calendar, manual booking entry, services/staff CRUD, settings                                    |
| **3 — Demo Polish**           | Realistic seeded demo tenant, mobile pass, visual design pass                                    |
| **4 — Validation**            | Show the live demo to 3–5 real barbershop owners, capture what actually confuses or excites them |
| **5 — Onboarding + Outreach** | Self-serve signup wizard, first paying/founding customers                                        |

Phases 0–3 map to the 14-day roadmap below. Phases 4–5 start as soon as there's something worth showing — realistically partway through Phase 2, not after Phase 3 finishes.

---

## 6. Personal Review vs. Claude Code Autonomy

### You review personally, every time

- `prisma/schema.prisma` — any change, before it's applied
- Every migration file, especially the exclusion-constraint SQL
- `lib/db/*` — anything that takes or omits a `tenantId` parameter
- `lib/auth/*` — session/auth configuration
- `proxy.ts`
- Any new npm dependency — approve before it's added, not after
- Pricing or business-rule logic (buffer time, lead time, cancellation window enforcement)

### Claude Code can implement autonomously (review after, not before)

- `components/*` — once a design direction is agreed
- Tailwind styling and layout
- Email templates
- Seed scripts
- Zod validation schemas (skim afterward)
- Tests

The dividing line is simple: **anything that touches tenant boundaries or the data model gets a plan-mode review before it's written; anything that's purely UI or presentation doesn't need to block on you.**

---

## 7. CLAUDE.md

See the separate `CLAUDE.md` file — it's written to be dropped directly into the project root.

---

## 8. First 14 Days

Read "Day" as a milestone number, not a calendar guarantee. Days 4, 10, and 11 are each
realistically closer to two focused sessions than one — slot math and two CRUD surfaces
aren't one-day tasks even with Claude Code doing the typing. If something has to slip,
protect Day 7 and let Days 10–13 absorb the slack — a working booking loop is what actually
de-risks the project; a slightly later demo does not.

| Day  | Deliverable                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Next.js project init (TS strict, Tailwind, ESLint incl. the `no-restricted-imports` rule banning Prisma outside `lib/db/**`), Vercel linked, Neon DB provisioned, Prisma initialized, first migration. Also start Resend domain DNS verification now — propagation takes time and shouldn't block Day 8                                                                                                                                                                                         |
| 2    | Auth.js v5, split into `auth.config.ts` (dependency-free, used by `proxy.ts`) and `auth.ts` (Prisma-backed Credentials `authorize`, Node runtime only) — get this split right now, not after `proxy.ts` breaks on import. Login page, route protection, seed script creating one demo tenant + owner. Also write a small CLI script to manually reset an owner's password hash — no in-app reset flow is in MVP scope, but a forgotten password shouldn't be able to kill a live customer trial |
| 3    | Exclusion-constraint migration (raw SQL, ranging over `blockedUntil`, status `IN ('CONFIRMED','COMPLETED')`), `cancelToken` via `crypto.randomUUID()`. Probe script asserts **both** directions: concurrent overlapping bookings → one rejected, genuinely back-to-back bookings (buffer = 0) → both accepted                                                                                                                                                                                   |
| 4    | `lib/availability/slots.ts` — working hours + time-off + existing bookings + buffer/lead time → open slots, unit tested (~2 sessions)                                                                                                                                                                                                                                                                                                                                                           |
| 5    | Public business page (`/b/[slug]`) — info + service list                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 6    | Booking flow UI — date/slot picker, service selection (delegate build to Claude Code once the flow is agreed)                                                                                                                                                                                                                                                                                                                                                                                   |
| 7    | Booking submission server action (re-verifying staff/service/customer belong to the tenant before insert), `SLOT_TAKEN` handling, confirmation screen — **core loop works end-to-end today, even if ugly**                                                                                                                                                                                                                                                                                      |
| 8    | Resend integration — confirmation email, owner notification, `/cancel/[token]` flow, per-phone rate limiting on the public submission (per-IP deferred — see `CLAUDE.md`)                                                                                                                                                                                                                                                                                                                       |
| 9    | Dashboard shell — layout, nav, auth guard, "today" overview pulling real data                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 10   | Calendar view (day/week, staff columns) (~2 sessions)                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 11   | Manual booking entry (walk-ins), services + staff CRUD — staff "removal" is `active = false`, never a real delete (~2 sessions)                                                                                                                                                                                                                                                                                                                                                                 |
| 12   | Settings screen wired to `Tenant` fields (buffer, lead time, cancellation window) — opening hours are edited per staff member on the Staff screen, not here                                                                                                                                                                                                                                                                                                                                     |
| 12a  | ~~Staff time off — the owner marks a barber away for a date range or part of a day, writing `TimeOff` rows. Inserted before Day 13 on purpose; see below~~ **Closed on Day 12a**                                                                                                                                                                                                                                                                                                                |
| 13   | Seed a polished demo tenant (real-looking branding, services, prices), mobile/design polish pass on the public flow                                                                                                                                                                                                                                                                                                                                                                             |
| 14.1 | Env prep: new Resend API key into `.env`, grep out the dead hardcoded owner address, `from` display name, full inventory of env vars the app reads                                                                                                                                                                                                                                                                                                                                              |
| 14.2 | First-ever Vercel import, env vars set in the dashboard, new Neon branch for production, first `prisma migrate deploy` against it, demo tenant seeded on prod                                                                                                                                                                                                                                                                                                                                   |
| 14.3 | Prod verification: exclusion constraint re-proven under Neon pooled connections, Auth.js edge/Node split on real Vercel runtime, root-URL fix, full owner + customer click-through on the live URL from a phone                                                                                                                                                                                                                                                                                 |
| 15   | Security and tenant-isolation audit — the only pre-launch review that runs. Narrow accessibility pass on the public booking page only                                                                                                                                                                                                                                                                                                                                                           |
| 15a  | i18n (German default, English toggle) + light/dark mode toggle + ~~drag-to-select booking on the calendar~~ (cut, decision 9). Inserted 13 Aug 2026; i18n is a reversal of an exclusion, the other two are new. See "Decisions recorded after 14.3" and "Recorded during Phase 15a"                                                                                                                                                                                                              |
| 16   | `Tenant.vertical` + terminology map, salon demo tenant seed, `DEMO.md`                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 16a  | Landing page — deliberately last, and deliberately not an SEO surface                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 17   | Code quality pass — **runs after the first 3–5 real demos, not before**                                                                                                                                                                                                                                                                                                                                                                                                                         |

By day 7 you have a working booking loop. By day 14 — realistically closer to day ~18–20
once the two-session items above are accounted for — you have something you can put in
front of a real barbershop owner and let them book on their own phone in front of you.
That's the milestone that matters, not "feature complete."

### Day 12a — staff time off, inserted before the polish pass (closed)

**Why it's inserted at all.** `TimeOff` has been in the schema since Day 1 and honoured by
`computeSlots` since Day 4 — the read path is complete and tested: `getStaffAvailability`
fetches the rows overlapping a day, `computeSlots` drops any candidate slot that overlaps
one, and manual booking entry already warns `DURING_TIME_OFF`. What was never scheduled is
the _write_ path. No day in the table above ever built a way for an owner to create a
`TimeOff` row, so the feature exists everywhere except where someone could use it. That's
an omission in the plan rather than a new idea, but it's still scope the table didn't
carry, which is why it's recorded here rather than quietly absorbed into Day 13.

**Why before Day 13 rather than after.** Day 13 is the design and mobile pass. A new form
built after it would arrive unstyled into a screen that had just been polished, and would
need its own second touch-up — the same work done twice, and the second pass done in
isolation is exactly how a screen ends up looking assembled from two eras. Building it
first means one pass covers both. The cost of the ordering is that Day 13 slips by however
long this takes; the cost of the other ordering is a visible seam on the staff screen,
which is a screen a prospect is shown.

**Why it stays small.** Only the write path and its display are missing, so nothing about
availability, the public flow or the booking rules changes. The whole feature is a
validation schema, two `lib/db` helpers, one action and one form on the staff detail
screen, next to the working-hours editor that already lives there.

**Overlapping bookings are advisory, never blocking.** Time off filters _candidate_ slots in
`computeSlots`; it has no effect on appointments already made. So a range saved over four
confirmed cuts always succeeds, leaves all four untouched — no auto-cancel, and no email to
the customer — and reports the count back to the owner, who is told to call them. That is
deliberately the same posture as Day 11's manual booking entry, which warns on a conflict
rather than refusing: the owner is the one who knows whether a customer can be moved. It is
also the only posture currently available, because there is still no way to cancel a booking
from the dashboard (deferred out of Day 11) — refusing the save would strand the owner with
no route forward.

**Finished time off is hidden, not deleted.** The owner's list filters on `endAt > now`, so
an entry drops off once it has _finished_ — not once it has started. An absence the barber is
in the middle of stays on screen, which is the one they're most likely to be looking for. The
rows themselves are never removed: `probe:crud` E6 asserts both halves, that a finished entry
is absent from the list and still present in the table, and E7 asserts the in-progress case
the `endAt` choice exists for. Nothing else in the app reads them, so hiding them costs the
owner nothing they can act on.

**Numbered 12a rather than renumbering.** Days 13 and 14 are cross-referenced by name
throughout this file — the carried-over sizing questions, the locale decision, the Day 11
and Day 12 deferrals all point at "Day 13". Shifting those numbers to make room would
invalidate every one of those references for no gain, and "Day" is already defined above as
a milestone rather than a calendar day.

### Carried into Day 13 — all three closed on Day 13

Sizing questions found while building the calendar (Day 10) that were deliberately not
answered there. Both are judgement calls about how things look at the edges of the range
rather than bugs, and both are cheaper to settle in one pass with a real demo tenant on a
real monitor than to guess at individually.

Note this widens Day 13's design pass beyond "the public flow" as the table above has it —
both items are dashboard-side.

Each carries its resolution below. One of the three was closed by deciding it needed no
code, which is a resolution and is recorded as one.

- **Tap targets on short calendar blocks.** A block's height is its duration: at 80px an
  hour a 20-minute booking is 27px and a 15-minute one 20px, and anything under 13px
  renders as a bar with no text at all. That is below a comfortable touch target, and it
  needs either a hit area larger than the visual block or a separate interaction for short
  appointments — decide it with a finger on a phone, not from the numbers.

  **Less urgent than it looked when this was written.** The original wording said "Day 11
  puts click-to-book on exactly these blocks", and Day 11 deliberately did not. Clicking a
  _booking_ is still not a gesture this calendar has; what shipped is a ladder of links on
  the empty space behind the blocks, on a fixed 30-minute grid (40px targets), which is
  what opens the manual booking form prefilled. So nothing today depends on hitting a
  20px block. This becomes live again the moment a block gains an interaction of its own —
  which is exactly what the deferred status actions below would do.

  **Closed on Day 13, with no code, and that is the resolution.** Confirmed against the
  source and against a seeded 15-minute booking: `ColumnBody` renders the link ladder under
  a `pointer-events-none` list, each block takes back only `pointer-events-auto` for its
  hover `title`, and no block has a click handler. There is no gesture to make bigger.
  Building a larger hit area now would be building it for an interaction that doesn't
  exist, and it would have to be redesigned anyway alongside whatever surface the status
  actions eventually get.

  **The residual, so it isn't rediscovered as a bug.** A block still absorbs the tap —
  correctly, that time is taken — and `title` is hover-only, so on a touch screen a
  `minimal` or `sliver` block cannot be read at all, and the day view has no mobile agenda
  to fall back to. That is a booking-detail problem, not a tap-target one. It is now
  attached to the status-actions deferral below, which is what will surface it.

- **Weekday names follow the runtime's locale, prices don't.** `formatStripDay` in
  `lib/format.ts` renders "Mon"/"Tue" and the day-of-month through Luxon with no locale
  argument, so they come out in whatever the runtime's default is. Money in the same file
  is pinned to `de-DE` by a module constant. That inconsistency is the actual thing to
  settle — not whether English abbreviations are acceptable. It affects two surfaces: the
  public booking date strip (since Day 6) and the calendar's week-view column headers.
  Vercel's Node runtime has historically defaulted to `en-US`, so this is latent rather
  than visible today; it surfaces the first time the runtime, a locale env var, or a
  self-hosted deployment differs. Either pin a locale next to `PRICE_LOCALE` or decide
  deliberately that dates follow the runtime while money doesn't.

  **Closed on Day 13: both are pinned, neither follows the runtime.** `DATE_LOCALE =
"en-GB"` sits next to `PRICE_LOCALE` in `lib/format.ts`, and every Luxon call in that
  file now goes through one of two helpers that apply it, so a new formatter cannot forget
  it — which is how the inconsistency arose one function at a time. That covers more than
  the two surfaces named above: `formatBookingDate` also renders in both booking emails,
  which is the case that decided it, since an email quotes a date to a customer as a
  promise and must not depend on which region a serverless function booted in.

  **The two locales stay different, on purpose.** Money is German because the money is
  German; prose is English because every word this product says is English, starting with
  the hand-written `WEEKDAY_LABELS`. German month names beside an English "Monday" column
  would be a worse inconsistency than the one being fixed. `en-GB` over `en-US` because the
  tokens are day-first; they render identically today. A test renders every affected
  function under `de-DE`, `fr-FR` and `ar-EG` and asserts the output doesn't move — it
  fails if the pin is removed.

  **Superseded in Phase 15a — the date locale now follows the interface language.** The
  premise above, "every word this product says is English", stopped being true when the
  German default shipped. What survives is the part that mattered: the locale is still
  never taken from the runtime. Every date formatter now takes the interface locale as a
  required argument (`de` → `de-DE`, `en` → `en-GB`), the same contract as `timezone`,
  and the test now renders both languages under hostile runtime defaults. Money is
  unchanged and still pinned to `de-DE` in both languages. Kept rather than rewritten,
  the same as the other corrections in this file.

  **One caller was not a display bug.** `localInstant` in `lib/dashboard/manual-booking.ts`
  detected the spring-forward gap by comparing `toFormat("HH:mm")` against the typed
  string. Luxon draws digits from the locale's numbering system, so under a runtime
  defaulting to `ar-EG` that comparison could never match and _every_ manual booking would
  be rejected as a nonexistent time. Fixed by comparing `local.hour`/`local.minute`
  numerically rather than by pinning a locale there: this is an internal validation check,
  not something rendered to a human, and it should not depend on a display decision at all.
  Guarded by a test that fails against the old implementation.

- **Dashboard header inset.** The header bar in `(dashboard)/layout.tsx` is capped at
  `max-w-5xl` while the calendar page now runs to `max-w-[120rem]`, so on a wide monitor
  the shop name and nav sit visibly inset from the grid's edges. Every other dashboard
  page repeats its own `max-w-5xl` wrapper, so the fix is either widening the header (which
  affects all five pages) or accepting the inset as deliberate. Not a call the calendar
  should make on its own, which is why it waited.

  **Closed on Day 13: the header is full-bleed and the alignment is abandoned on purpose.**
  The cap is gone from `(dashboard)/layout.tsx` — one file; the five page wrappers are
  untouched and keep their `max-w-5xl`. Both alignment-preserving options were rejected:
  matching the header to the calendar breaks it on the other four pages instead, and
  widening all five pages puts settings forms and the services list on a 120rem line, which
  is worse to read than any misalignment. The header is now app chrome that lines up with
  nothing at every width on every page — a rule, rather than a coincidence that only held
  below 64rem. The cost, stated rather than discovered later: on an ultrawide monitor the
  shop name and Sign out sit at opposite edges of the screen.

### Deferred out of Day 11

Decided while building manual booking entry and the two CRUD screens, recorded here so
each reads as a decision rather than an oversight. None is a bug; all five are choices
that wanted a real customer or a schema change behind them.

- **Editing a service's price rewrites reported history.** Nothing snapshots the price on
  a `Booking` — `summariseDay` reads `priceMinorUnits` live off the `Service` row, so
  changing a price moves yesterday's and last month's revenue figures with it. Flagged
  since Day 9; Day 11 is what makes it reachable, because before this the only way to
  change a price was the seed script. A price snapshot is a schema change (rule 3) and
  belongs with payments, where the same column has to exist anyway. The services form says
  so out loud in the meantime, which is the honest interim answer.

  Note the neighbouring case is _not_ a bug and must not be "fixed" alongside it: editing a
  service's **duration** leaves existing bookings at the length they were booked for,
  because `endAt` and `blockedUntil` are snapshotted at creation. The customer was told 30
  minutes. Recomputing those would silently reshuffle a day the owner has already planned.

- **A walk-in with no phone number can't be recorded.** `Customer.phone` is non-null and is
  the tenant's identity key (`@@unique([tenantId, phone])`), so manual entry requires a
  number exactly as the public form does. That keeps `findOrCreateCustomer` matching a
  walk-in to the same person's online bookings, at the cost of the owner having to ask.
  Two ways out when a real shop says this blocks them: make `phone` nullable and replace
  the unique constraint with a partial unique index over non-null phones, or give each
  anonymous walk-in its own customer row. The first is right and is a migration; the second
  is cheap and pollutes the column the shop reads to phone someone. Either way it's rule 3.

- **No status actions from the dashboard.** Marking a booking completed, no-show, or
  cancelling it on the customer's behalf is not in Day 11's line in the table above, and it
  wants a booking-detail surface that shouldn't be designed on a guess. Worth noting the
  data model is already ready for it — `cancelBookingByToken` anticipates the owner
  marking things complete, and `OCCUPYING_STATUSES` already handles COMPLETED correctly.
  Revisit after watching a real owner work a day, since the end-of-day workflow is the part
  no amount of reasoning here will get right.

- **Buffer, lead time and cancellation window are still seed-time values.** ~~Day 12's
  settings screen, unchanged.~~ **Closed on Day 12** — all three are editable at
  `/dashboard/settings`. The half of this note that still stands: manual booking entry
  deliberately ignores `minLeadMinutes` (an owner recording a walk-in is not the person
  that rule protects the shop from), so changing it does _not_ affect the dashboard's own
  booking form. The field's hint on the settings screen says so.

- ~~**Per-tenant weekday and month names still follow the runtime's locale.** Untouched by
  Day 11 and still on the Day 13 list above.~~ **Closed on Day 13** — pinned to `en-GB` in
  `lib/format.ts`; see the locale item above. The hours editor's use of the fixed English
  `WEEKDAY_LABELS` is no longer a surface pinned by hand against a drifting default: the
  two now agree because both are English by decision rather than by coincidence.

### Deferred out of Day 12

- **The cancellation window applies retroactively, and that is the shipped behaviour.**
  Nothing snapshots it onto a `Booking`: `getBookingByCancelToken` reads
  `cancellationWindowMinutes` live off the tenant row, while the confirmation email quoted
  the customer the value that was set the day they booked. So raising 2 h → 24 h can refuse
  a cancellation someone was explicitly told they could make. This is the same shape as the
  price-history case above, and it gets the same answer: snapshotting the window is a schema
  change (rule 3), it belongs with the price snapshot rather than in front of it, and the
  interim answer is to say so out loud — the settings form warns before the owner saves.
  Lowering the window is always safe; only raising it can strand someone.

- **Nothing else on `Tenant` is editable.** Name, slug, address, phone, contact email and
  timezone are shown read-only on the settings screen and are still seed-time values. Slug
  and timezone are the two that aren't merely unbuilt: changing a slug breaks every booking
  link already in circulation, and changing a timezone redraws every existing booking's
  displayed time without moving the stored instant. Both want a deliberate decision about
  what happens to what's already out there, not a text input.

### Deliberately not built: the day view's mobile fallback

Decided during Day 10, recorded here so it reads as a decision rather than an oversight.

The **week** view falls back to a vertical agenda below `md`
(`components/dashboard/week-agenda.tsx`), because its seven columns need 1072px before
they start scrolling and that is fixed no matter how small the shop is. The **day** view
did not get the same treatment, and that is deliberate: its column count is the shop's
barbers, so at the one-to-three chairs this product targets it fits a phone. Building a
second fallback for a problem nobody has yet is the speculative work `CLAUDE.md` says to
skip.

**Where that stops being true:** each column has a 9rem floor plus a 4rem axis, so the day
view starts scrolling on a 390px phone at four barbers (640px) and is meaningfully awkward
at five (784px). If a real customer arrives with four or more chairs, this is the thing
that breaks first.

**`WeekAgenda` was built with exactly that reuse in mind.** It takes
`{ date, bookings }[]` and carries no week-specific logic — no geometry, no lanes, no
axis, and no assumption that there are seven of anything. A day view fallback is the same
component passed a single-entry array, plus the same `hidden md:block` / `md:hidden` swap
already in `dashboard/calendar/page.tsx`. Do not write a second agenda component for it.

### Two Day 1 deliverables that were never actually done

Found on Day 14, thirteen days after the fact. Recorded rather than silently
corrected, because a plan that quietly rewrites its own history is worth less
than one that admits what slipped.

**"Vercel linked" never happened.** The repo was never imported into a Vercel
project — confirmed by the Import button still showing for `barber-saas` in
Vercel's repository list. Nothing downstream depended on it until Day 14, so
it went unnoticed for the entire build. The consequence is that Day 14 is a
_first_ production deploy, not a redeploy: first-time env var configuration,
a production Neon branch that doesn't exist yet, and a `prisma migrate
deploy` that has never run outside a local machine.

**"Start Resend domain DNS verification now" never happened either**, and the
stated reason for putting it on Day 1 — that propagation takes time and
shouldn't block Day 8 — turned out to be exactly right in a way the plan
didn't anticipate. No domain was ever bought. Day 8's email work was built
and tested entirely against Resend's sandbox, which delivers only to the
account owner's own address. That limitation was invisible during
development, because the developer's address is the one it delivers to.

Closed 8 Aug 2026 in 14.1, thirteen days late: `bookilo.de` is bought and
verified. The Day 1 reasoning was sound and the cost of ignoring it was paid in
full — every email in the product was written and tested against a delivery
path that no real customer would ever use.

### A naming decision that was reversed outside the plan

Found 12 Aug 2026, during 14.3. Recorded here for the same reason as the two
above: the decision was made, written down with its cost stated, and then
reversed by something that never went through the plan. Overwriting the old text
would leave three documents quietly agreeing with a history that didn't happen.

**The decision was to keep `barber-saas` everywhere.** Stated in
`V1-LAUNCH-PLAN.md` as: none of it is user-facing, and renaming "buys nothing but
a broken git remote." The reasoning was sound and the predicted cost was the right
one to predict.

**The repo was renamed to `bookilo-saas` on GitHub anyway.** Outside any
deliberate process recorded here; cause unconfirmed. The predicted cost was then
paid exactly as written — `origin` still pointed at `barber-saas.git`, and pushes
kept working only on GitHub's rename-redirect courtesy, which is not a guarantee
and expires if the old name is ever reclaimed. That went unnoticed until a push on
12 Aug 2026 printed the redirect notice; `origin` was repointed the same day.

**A second, older error surfaced with it.** The line above claimed the *Vercel
project* was named `barber-saas` too. It never was: `bookilo-saas` was typed
deliberately at import during 14.2, so that clause was already false from 14.2
onward, independent of the GitHub rename. It survived because nothing reads a
Vercel project's name to do its job — the same reason "Vercel linked" went
unnoticed for thirteen days.

**What remains unverified — naming:** whether the GitHub rename desynced Vercel's Git link.
A rename normally propagates, because the integration stores the numeric
repository ID rather than `owner/name` — but that is the general behaviour, not a
check that was run. It could not be checked from the development machine: no
`.vercel/` directory, no Vercel CLI, no `VERCEL_TOKEN`, and `gh` unauthenticated.
The decisive test is whether commit `5ab1aab` produced a deployment.

### Decisions recorded after 14.3

Recorded 13 Aug 2026, from decisions taken during and after the production
verification. Same posture as the standing boundaries above: each states what was
decided, what it costs, and why the cost is worth paying. A decision recorded
without its price is a preference, and gets renegotiated the first time it is
inconvenient.

Inserted as `15a` and `16a` rather than by renumbering. The `a` suffix is the
convention this plan already uses for a phase slotted in after the fact (Day
12a), and renumbering would silently invalidate every "Phase 16" and "Phase 17"
reference in this file, in `V1-LAUNCH-PLAN.md`, and in the commit history.

**1. i18n — German default, English toggle. Reversed from "excluded entirely" to
the next thing built after Phase 15.** The original exclusion treated i18n as a
future-market concern, which is the one thing it is not. The demo is conducted in
person, in Germany, to German shop owners: an English-only interface is a live
objection in the actual meeting, raised by the actual prospect, not a hypothetical
cost of expanding later. Secondary and real, but not the reason: an English toggle
gives the codebase portfolio value in English-language job interviews, which is a
genuine second audience for this work.

*Cost:* translation and locale plumbing land before the salon vertical, pushing
Phase 16 and the landing page later by however long it takes. Every user-facing
string in the product becomes two strings, and every screen added after this costs
more to build than one added before it. This is the largest single scope addition
since the MVP was fixed, and it touches every screen in the app. Accepted because
a demo the prospect cannot read is not a demo. *Scope limit:* a default locale
plus a toggle. Not locale-routed URLs, not per-tenant language settings, not a
translation-management service — those stay excluded and would need their own
decision.

**2. Light/dark mode toggle — new deliberate addition, Phase 15a.** Not a
reversal: dark mode has never been excluded in writing anywhere in this plan, in
`V1-LAUNCH-PLAN.md`, or in `CLAUDE.md`, so it is recorded as a plain new decision
rather than dressed up as a correction. Motivation is demo polish — the kind of
thing a prospect notices in thirty seconds and reads as "this is a real product."

The implementation constraints are already on record in the code and are
referenced rather than restated: `globals.css:71-74` (a dark theme needs the whole
palette, not two variables), `globals.css:13` (`color-scheme: light` must change,
or browser-painted chrome — scrollbars, autofill shading, the date/time picker
panel, the caret — stays locked light against a dark page), and `field.tsx:60`
(the Tailwind v4 preflight regression that produced white-on-white form text the
last time a `prefers-color-scheme` block existed here; the new theme has to be
tested against exactly that case).

*Cost:* doubles the surface needing visual QA before the demo — every screen, in
both themes, including the ones nobody looks at twice. The failure mode is not a
missing feature but one unreviewed screen rendering unreadably in front of a
prospect, which is worse than having no dark mode at all.

**3. Drag-to-select booking on the calendar — new deliberate addition, Phase
15a.** Also not a reversal; no prior exclusion exists. Outlook/Google
Calendar-style range selection: drag across a time range to open a booking
prefilled with it. On touch, selection begins with a **long press, not a plain
drag** — plain drag on a touch device collides with the scroll gesture, and the
calendar is a scrolling surface on exactly the screens where this matters most.

*Reason:* ergonomics for daily use. The calendar is the screen a shop owner opens
many times a day, and it is currently the slowest path in the product for the most
common action. This is the one item of the three that pays off after the demo
rather than during it.

*Cost:* real implementation complexity, not a UI toggle. Pointer event handling
across mouse and touch, a selection state that survives re-render, and hit-testing
against the existing lane layout in `calendar-layout.ts`. This is the item most
likely to overrun its estimate, and the first to cut if Phase 15a threatens the
demo date.

**4. Landing page — confirmed deliberately last, after items 1–3 and after Phase
16.** Its purpose is a link to leave with a shop owner after an in-person pitch,
so they can find the product again and show a partner. It is not an SEO or
organic-discovery surface and it is not the top of a funnel.

*Cost:* no organic discovery at all until it exists, and no URL to hand over in the
meantime beyond the demo tenant's booking page. Accepted, because the acquisition
channel for the first customers is walking into shops in Stuttgart, not search. A
landing page built before the features that make the demo credible would be a page
describing a product the prospect had just watched fall short.

### Recorded during the Phase 15 audit

Recorded 27 Sep 2026. The audit covered tenant scoping, per-action authorization, the
proxy/Node auth split, client-supplied `tenantId`, and soft-delete enforcement. It found
no cross-tenant read or write path. The changes it made are verified by `probe:crud`
phases F–H and `probe:cancel` phase G. What follows is the behaviour it changed, plus
the risks it left open on purpose.

**5. The public booking form no longer rewrites a returning customer.** Before,
`findOrCreateCustomer` upserted on `(tenantId, phone)` and overwrote `name` and
`email` from whatever the unauthenticated form sent. Anyone who knew a customer's
phone number could rename them across the owner's whole booking history (the
dashboard reads the name live) or swap in their own email. Now the public path
creates the customer on first contact and otherwise only links the booking to the row
as stored. The owner's manual booking form, which is authenticated, still updates it.

*Cost:* a customer who mistyped their name on a first online booking can't correct it
by booking again. The owner has to, from a manual booking. There is still no
customer-edit screen.

**6. Every authenticated request re-reads the user row. A password reset still does
not end existing sessions.** `getSession` in `lib/auth/session.ts` now checks that the
JWT's user still exists in the JWT's tenant with role `OWNER`, and otherwise treats the
request as signed out. That closes two gaps: a deleted user kept dashboard access for
the token's lifetime (30 days by default), and a `STAFF` user would have had full owner
rights, because nothing checked `role`. As a result, the "signed in → skip `/login`"
redirect moved from `proxy.ts` to the login page. The proxy only sees the JWT, so it
would bounce a deleted user's token between `/login` and `/dashboard` forever.

*Cost:* one indexed primary-key query per request, memoized per request by `cache()`.
*Still open:* after `scripts/reset-password.ts`, the user row is unchanged, so a
session issued before the reset stays valid until it expires. Closing that needs a
per-user token version checked against the JWT, which is a schema change (CLAUDE.md
rule 4) and needs its own plan.

**7. The phone-keyed rate limiter can be used against a known number.** The limiter
counts bookings per `(tenant, phone)`. Someone who knows a customer's number can make
three bookings with it and block that customer from booking online for an hour. This
is inherent to keying an anonymous form on phone, and the alternative (per-IP limits)
needs a persistent store, which is a dependency that waits for evidence of real
abuse (CLAUDE.md). Left as is. When the shop has a phone number, the lockout message
already gives it, so a blocked customer can still call to book.

**8. Soft delete for Staff and Service is enforced by the Prisma client, not only by
convention.** `lib/db/prisma.ts` wraps the client with a query extension that throws
on `delete`/`deleteMany` for both models. `onDelete: Restrict` on `Booking` protected
only rows that had bookings; a never-booked barber could be hard-deleted, and their
hours and time off would cascade with them. SQL-level cascades from deleting a whole
Tenant are deliberately not blocked, because the probes' cleanup depends on them.

### Recorded during Phase 15a

Recorded 27 Sep 2026, while implementing items 1 and 2 above. Same format as the
entries above: what was decided, what it costs.

**9. Drag-to-select (item 3) is cut from Phase 15a.** Item 3's own justification was
daily-use ergonomics — "the one item of the three that pays off after the demo rather
than during it" — and it was already marked as the first to cut. The project's stated
goal is a complete, reviewable portfolio piece (`CLAUDE.md`, Project context), which
the benefit doesn't serve, while the cost it named stays the same: the highest
implementation risk of the three items. Cut, not excluded. It is not added to the
exclusions list, and bringing it back needs only a new entry here, not a reversal.

*Cost:* booking from the calendar stays at its current speed. The existing path is
clicking an empty slot, which opens the manual booking form prefilled with barber, day
and time, at 30-minute granularity.

**10. Language and theme are per-browser cookie preferences.** Two cookies, `locale`
(`de` | `en`) and `theme` (`system` | `light` | `dark`), read server-side in
the root layout, so the first byte already has the right `lang` and `data-theme`. No
flash, and no inline script. The toggles appear in the dashboard header and on the
login page only. A customer on `/b/[slug]` gets German and their OS theme, with no
switch.

*Cost:* the choice doesn't follow an owner to another device, because storing it per
user would be a schema change. Per-tenant language is excluded under item 1. A browser
that has set a preference also carries it onto that shop's public pages, which is how
an owner previews their page in English. That is harmless, since it identifies nobody.

**11. Emails are always German.** An email is sent after the request that caused it,
to a recipient whose language is recorded nowhere: customers have no account, and the
owner-notification recipient isn't the person who clicked. `EMAIL_LOCALE` in
`lib/email/templates/shell.ts` is a constant, not a parameter.

*Cost:* an owner who uses the dashboard in English still gets German booking
notifications. A per-recipient language needs a column, which is a schema change and
its own decision.

**12. The Kastanien marketing page is excluded from both features.** It is the shop's
own copy, written in English, on a fixed dark palette (`shop-*` tokens, not
`light-dark()` pairs). It stays English in both languages, carries `lang="en"` on its
wrapper so screen readers don't read it with German pronunciation, and looks the same
in both themes. Translating a shop's marketing copy is content work for that shop, not
app chrome.

### Deferred out of Day 14

- **The full production-readiness review was cut down to security only.** The
  original ask covered seventeen categories — clean code, duplication, dead
  code, naming, performance, UI consistency, accessibility, and so on. What
  runs before launch is tenant scoping, auth coverage, secrets in the client
  bundle, cancel-token entropy, rate limiting on the public endpoint, and
  migration integrity. Those are the failures that leak or lose data and
  can't be walked back. The rest is real work that no barbershop owner will
  ever say no because of, and half of it would be rewritten once real usage
  shows which parts of the codebase actually matter. It runs as Day 17,
  after the demos.

  The one exception carved out: a keyboard-navigation and contrast pass on
  the **public booking page only**. It's the single surface whose audience
  isn't chosen.

- **No verified sending domain, so the demo cannot use a prospect's email.**
  Resend is in sandbox mode: outbound mail reaches exactly one address, the
  account owner's. A prospect typing their own address into the booking form
  during a demo gets nothing, and the booking still succeeds — the send
  failure is caught so bookings don't break, which is correct behaviour and
  also why it's silent. The demo works by booking as the customer using the
  account's own address, in front of the owner. `DEMO.md` states this at the
  top rather than in a footnote, because it is the most likely way a demo
  breaks in front of a real person. Resolved by buying a domain and
  verifying DNS — roughly €10–15/year, worth doing the moment a prospect
  wants a trial, not before.

  **Closed 8 Aug 2026, during 14.1.** The item above is left as written rather
  than edited into agreement with the present, per the convention two sections
  up. What it said: sending was sandbox-limited to one address, a prospect's
  address would silently fail, and `DEMO.md` had to lead with that warning.
  What changed: `bookilo.de` was bought and verified in Resend the same day, so
  none of it holds any more. `EMAIL_FROM` is now
  `Bookilo <noreply@bookilo.de>`, a prospect's own address receives mail, and
  booking with their address is the better demo. The "book with your own
  address" instruction is withdrawn from the Phase 16 plan, because a stale
  warning read mid-demo is worse than no warning.

  Two things the item got right that survive it. Its cost estimate was
  accurate — the domain came in inside the €10–15/year it predicted, which
  makes "worth doing the moment a prospect wants a trial" look conservative in
  hindsight; it was worth doing on Day 1, as originally planned and skipped.
  And its diagnosis of *why* the failure was silent was correct and still is:
  the send failure is caught so bookings don't break. Verification removed one
  cause of silent non-delivery, not the silence itself — see the next item,
  which is that same silence with a different trigger.

  What verification does not buy is reputation. A domain that has never sent
  mail is routinely filtered, so "does it arrive, and does it arrive in the
  inbox" stays a manual pre-demo check rather than a settled question.

- **A send that never happens still reports success, and nothing in the app
  can tell.** `sendEmail` returns `{ ok: true, skipped: true }` when
  `RESEND_API_KEY` or `EMAIL_FROM` is absent, logging at `console.info` and
  sending nothing. That is exactly right locally — it's what lets the booking
  flow work end to end with no credentials on a laptop — and it is the wrong
  shape in production, because a Vercel environment missing either variable
  produces bookings that look completely healthy and confirmations that never
  existed. `ok: true` is the same value a real send returns, so no caller can
  distinguish them, and the one trace is an info line in a serverless log
  nobody reads.

  `APP_URL` has the same shape and is worse, because it fails while
  configured-looking: absent, it falls back to `http://localhost:3000`, and
  every confirmation ships a cancel link to the customer's own machine. The
  email sends, arrives, and is broken.

  Not fixed now because the correct fix is a decision, not a patch, and it
  wants one pass over all three variables rather than three ad-hoc guards.
  The options, for when it's taken: fail the build on a missing required var
  in production; or keep the tolerant runtime path but promote the skip from
  `info` to `error` when `NODE_ENV === "production"`, so the log line is at a
  level that gets noticed. The first is a real guarantee; the second is
  cheap and doesn't risk a boot loop on a deploy. Either way the deciding
  constraint is that a booking must still never fail because email is
  misconfigured — that part of the current behaviour is correct and stays.

  Mitigated in the meantime by documentation only: `.env.example` and
  V1-LAUNCH-PLAN 14.2 both now state that `APP_URL` is required in production
  and why its failure is invisible. Documentation is not a control, which is
  why this stays on the list.
