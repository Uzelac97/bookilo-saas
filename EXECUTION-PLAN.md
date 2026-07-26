# Execution Plan — Barbershop Booking SaaS (MVP)

Solo developer, Claude Code-assisted, Next.js/TypeScript/Prisma/PostgreSQL/Tailwind/Vercel.
Companion files: `schema.prisma`, `CLAUDE.md`.

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
| Owner dashboard | Day/week calendar, manual booking entry (walk-ins), services CRUD, staff CRUD (including each staff member's working hours), settings (buffer, lead time, cancellation window)                                                                        |
| Notifications   | Email only (Resend): booking confirmation to customer, new-booking alert to owner                                                                                                                                                                     |
| Tenancy         | Single business per tenant, generalist staff (any active barber can take any active service). Opening hours are per-staff (`WorkingHours`) — there is no separate business-level hours field; "closed Sunday" simply means no staff has Sunday hours. |

### What's explicitly cut from the earlier draft, and why

- **No `Location` model.** Every target customer (1–5 chair barbershop) has exactly one location. Address/timezone live directly on `Tenant`; opening hours live per staff member (`WorkingHours`), not on `Tenant`. Adding a `Location` table later, when you actually sell to a second location, is a small additive migration — not a rebuild. Building it now is speculative.
- **No `StaffService` mapping table.** Unlike hair salons, barbershops are generally staffed by generalists — any active barber can perform any active service. This removes an entire join table, an entire admin UI, and a whole class of "which staff can do this" logic from the booking flow. If a real customer later needs staff-service restrictions, it's one additive table plus a filter in the availability query — not architecture surgery.
- **`Service.category` is a plain optional string**, not a separate taxonomy table. It exists only to group services visually on the booking page.
- **No staff self-login.** Staff are managed by the owner; they don't have accounts yet. The `User.role` enum already includes `STAFF` so this is a Phase 2 feature addition, not a data-model change.

### What's excluded entirely for now

Staff login, SMS/WhatsApp reminders, deposits/payments, multi-location, analytics dashboard, customer accounts, i18n, recurring/subscription bookings, reviews or any marketplace surface, POS/inventory, granular permissions beyond Owner/Staff.

### Standing boundary: per-tenant customization vs. custom development

Decided early, deliberately, so it's not renegotiated live under pressure from an eager first customer.

**Unbounded and already supported, no architecture change needed:** how many services, categories, staff members, and how long the descriptions are. A tenant with 5 services and one with 40 already hit the same `Service` table and the same `service-list.tsx` component — more data, not different code.

**Safe to add later, cheap, same additive pattern as `Location`/`StaffService` being deferred from the MVP:** logo, one or two brand colors, a photo gallery, staff bios/headshots. A small number of nullable `Tenant` columns (or one small table), rendered in a fixed spot in the shared template. Build when a real customer asks, not speculatively.

**The line that must not move: every tenant renders through the same components and the same layout, always.** Bounded content and branding variation, yes. Structural variation — a different arrangement of sections, a new section type invented per customer, custom CSS — no. If a real prospect's actual ask is custom layout, that's a signal they're outside this product's target customer (independent shops with no website today, not design-opinionated clients), not a feature gap to close. The moment layout varies per tenant, this stops being a flat-fee SaaS product with zero marginal cost per customer and becomes a web design agency with a booking feature bolted on.

If bounded optional sections (About, Gallery, Testimonials, Team) are ever built, they're a fixed menu of block _types_ a tenant can toggle on/off and fill with content — never an open-ended page builder.

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

| Day | Deliverable                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Next.js project init (TS strict, Tailwind, ESLint incl. the `no-restricted-imports` rule banning Prisma outside `lib/db/**`), Vercel linked, Neon DB provisioned, Prisma initialized, first migration. Also start Resend domain DNS verification now — propagation takes time and shouldn't block Day 8                                                                                                                                                                                         |
| 2   | Auth.js v5, split into `auth.config.ts` (dependency-free, used by `proxy.ts`) and `auth.ts` (Prisma-backed Credentials `authorize`, Node runtime only) — get this split right now, not after `proxy.ts` breaks on import. Login page, route protection, seed script creating one demo tenant + owner. Also write a small CLI script to manually reset an owner's password hash — no in-app reset flow is in MVP scope, but a forgotten password shouldn't be able to kill a live customer trial |
| 3   | Exclusion-constraint migration (raw SQL, ranging over `blockedUntil`, status `IN ('CONFIRMED','COMPLETED')`), `cancelToken` via `crypto.randomUUID()`. Probe script asserts **both** directions: concurrent overlapping bookings → one rejected, genuinely back-to-back bookings (buffer = 0) → both accepted                                                                                                                                                                                   |
| 4   | `lib/availability/slots.ts` — working hours + time-off + existing bookings + buffer/lead time → open slots, unit tested (~2 sessions)                                                                                                                                                                                                                                                                                                                                                           |
| 5   | Public business page (`/b/[slug]`) — info + service list                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 6   | Booking flow UI — date/slot picker, service selection (delegate build to Claude Code once the flow is agreed)                                                                                                                                                                                                                                                                                                                                                                                   |
| 7   | Booking submission server action (re-verifying staff/service/customer belong to the tenant before insert), `SLOT_TAKEN` handling, confirmation screen — **core loop works end-to-end today, even if ugly**                                                                                                                                                                                                                                                                                      |
| 8   | Resend integration — confirmation email, owner notification, `/cancel/[token]` flow, per-phone rate limiting on the public submission (per-IP deferred — see `CLAUDE.md`)                                                                                                                                                                                                                                                                                                                       |
| 9   | Dashboard shell — layout, nav, auth guard, "today" overview pulling real data                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 10  | Calendar view (day/week, staff columns) (~2 sessions)                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 11  | Manual booking entry (walk-ins), services + staff CRUD — staff "removal" is `active = false`, never a real delete (~2 sessions)                                                                                                                                                                                                                                                                                                                                                                 |
| 12  | Settings screen wired to `Tenant` fields (buffer, lead time, cancellation window) — opening hours are edited per staff member on the Staff screen, not here                                                                                                                                                                                                                                                                                                                                     |
| 13  | Seed a polished demo tenant (real-looking branding, services, prices), mobile/design polish pass on the public flow                                                                                                                                                                                                                                                                                                                                                                             |
| 14  | Full dry run as both "owner" and "customer," fix rough edges, deploy, prepare the live in-person demo script, book your first 3–5 demo meetings                                                                                                                                                                                                                                                                                                                                                 |

By day 7 you have a working booking loop. By day 14 — realistically closer to day ~18–20
once the two-session items above are accounted for — you have something you can put in
front of a real barbershop owner and let them book on their own phone in front of you.
That's the milestone that matters, not "feature complete."
