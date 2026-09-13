# CLAUDE.md

Rules for working on this codebase. Read this before planning or implementing anything.

## Project context

Barbershop booking SaaS. Solo developer. This is a portfolio project: the goal is a
complete, well-built application that holds up under technical review for
frontend/full-stack roles and freelance work — not speed to a first paying customer.
Prioritize correctness, security, and code a reviewer can read over shipping velocity.
Source of truth for scope: `EXECUTION-PLAN.md` and `prisma/schema.prisma`. If a request
seems to go beyond what's in those files, say so and ask before building it — don't
silently expand scope.

Single codebase, single architecture. The target is barber shops and hair salons —
nothing else. What differs between them is terminology, branding, and demo seed data,
never a second code path: no new domain entities (`Resource`, `Room`, `Equipment` are
all deferred).

## Non-negotiable rules

1. **Every tenant-owned query goes through `lib/db/*`.** Never call `prisma.<model>.findMany`
   (or any Prisma method) directly from a component, server action, or route handler for
   `Booking`, `Staff`, `Service`, `Customer`, or `User`. Always go through the scoped
   helper functions, and always pass `tenantId` explicitly. If a helper doesn't exist yet
   for what you need, add one to `lib/db/*` rather than reaching for `prisma` directly.
   Each helper takes `tenantId` as a parameter and bakes it into the `where` clause, so
   the scoping cannot be forgotten at a call site: read a day with
   `getBookingsForDay(tenantId, { date, timezone })` or a span with
   `getBookingsForRange(tenantId, { fromDate, toDate, timezone })` — never
   `prisma.booking.findMany`.

2. **Dashboard mutations resolve `tenantId` from the server-side session, never from
   client input.** If you're writing a server action for an authenticated route, get the
   tenant from `getCurrentTenant()` / the session — do not accept a `tenantId` field from
   the request body or form data.
   **The two resolution paths are never mixed.** Public routes (`/b/[slug]`) resolve the
   tenant from the URL slug, server-side, on every request. Dashboard routes resolve it
   from the authenticated session (`session.tenantId`). A public route must not reach for
   the session to establish identity, and a dashboard mutation must never accept a
   client-supplied `tenantId`.

3. **Every write to `Booking` re-verifies its foreign keys before inserting.** A Prisma
   foreign key only checks that a `staffId`/`serviceId`/`customerId` row exists somewhere —
   not that it belongs to the tenant making the request. Before creating a `Booking`, the
   write helper in `lib/db/bookings.ts` must re-fetch the staff/service/customer scoped by
   `tenantId` and fail if any of them don't belong to that tenant. This is the only thing
   standing between a bug and one tenant's booking pointing at another tenant's staff.

4. **Any change to `prisma/schema.prisma` or any migration file requires a plan first,
   in plain language, before you write it.** Explain what's changing and why. Wait for
   approval. This includes adding fields, not just new models.

5. **Do not add a new npm dependency without asking first**, including "small" ones. State
   what it's for and what the alternative would be without it.

6. **Do not build anything listed as excluded in `EXECUTION-PLAN.md`**: staff login,
   SMS/WhatsApp reminders, deposits/payments, multi-location, analytics dashboard,
   customer accounts, ~~i18n~~, recurring/subscription bookings, reviews or any
   marketplace surface, POS/inventory, granular permissions beyond Owner/Staff,
   `Resource`/rooms/bays/equipment, any vertical beyond barber shops and hair salons,
   custom domains, wildcard subdomains — unless explicitly asked to start that phase.

   `i18n` is struck because it was **reversed**, not dropped: it moved to Phase 15a on
   13 Aug 2026 in commit `f1d73e9`. Struck rather than deleted, matching
   `EXECUTION-PLAN.md` — a list that quietly removes its own reversals stops being a
   record of what was decided. Everything else above still stands.

7. **Never write a comment claiming I reviewed, raised, approved, or decided something.**
   "This has been raised and kept", "the user confirmed", "deliberate — do not correct
   it" are not verifiable from inside the repo, and a future session reads them as
   authority. If a decision is real it goes in `EXECUTION-PLAN.md` under the
   recorded-decisions section, where I can see it. If a discrepancy is deliberate, the
   comment gives the technical reason and says nothing about who approved it. This has
   produced three wrong records so far: two invented exclusions (dark mode,
   drag-to-select) and the Berlin/Stuttgart mismatch comment in the Kastanien marketing
   page.

## Planned next — in scope, do not re-add as exclusions

**Phase 15a**, after the Phase 15 security audit and before the salon vertical:

- **i18n** — German default with an English toggle. A default locale plus a toggle only:
  _not_ locale-routed URLs, per-tenant language settings, or a translation-management
  service. Those three remain excluded.
- **Light/dark mode toggle** — the constraints are already recorded in the code and
  should be read before starting: `globals.css:71-74` (a dark theme needs the whole
  palette, not two variables), `globals.css:13` (`color-scheme: light` must change, or
  browser-painted chrome — scrollbars, autofill, the date/time picker, the caret —
  stays locked light), and `field.tsx:60` (the Tailwind v4 preflight regression that
  produced white-on-white form text last time a `prefers-color-scheme` block existed).
- **Drag-to-select booking on the calendar** — Outlook/Google Calendar-style range
  selection. On touch it must begin with a long press, never a plain drag: plain drag
  collides with the scroll gesture, and the calendar scrolls on exactly those devices.

**Phase 16a** — the landing page, deliberately last. It is a link to leave behind after
an in-person pitch, not an SEO or organic-discovery surface.

**"No dark mode" and "No drag-to-select" were never project decisions.** An earlier
session invented both as exclusions; neither phrase ever appeared in
`EXECUTION-PLAN.md`, `V1-LAUNCH-PLAN.md`, or this file. Do not re-add them. The
authoritative records are "Decisions recorded after 14.3" in `EXECUTION-PLAN.md` and
the Phase 15a/16a sections in `V1-LAUNCH-PLAN.md`.

## The overlap-prevention exclusion constraint

The one invariant Prisma cannot express, so it lives in a migration as raw SQL. It is
the database's own guarantee against double-booking, and it is the reason `prisma db
push` is banned here: `db push` has no record of it and silently drops it as
unrecognized drift.

```sql
ALTER TABLE "Booking"
ADD CONSTRAINT no_overlapping_bookings
EXCLUDE USING gist (
  "staffId" WITH =,
  tsrange("startAt", "blockedUntil") WITH &&
) WHERE (status IN ('CONFIRMED', 'COMPLETED'));
```

Two details are easy to get wrong, and both only misbehave under concurrency:

- **The range is over `blockedUntil`, not `endAt`**, so `bufferMinutes` is enforced by
  the database rather than merely by `slots.ts`.
- **The status list includes `COMPLETED`, not just `CONFIRMED`** — otherwise marking a
  booking complete silently reopens its own slot. `slots.ts` must treat the identical
  status set as occupied, or you get ghost slots that look free in the UI and fail at
  submit.

**The error path.** Prisma does not surface a violation as a typed error — it arrives as
a `PrismaClientUnknownRequestError` carrying SQLSTATE `23P01`, and `isSlotTakenError` in
`lib/db/bookings.ts` translates that into the `SLOT_TAKEN` result the booking form shows
as "someone got there first." If that matcher ever stops matching, the customer sees a
generic error instead, which is why it is probed rather than assumed.

**The probe.** `scripts/probe-exclusion-constraint.ts`, run with `npm run
probe:constraint`. It asserts both directions: two concurrent bookings for the same
staff and slot leave exactly one created and one `SLOT_TAKEN`, _and_ two genuinely
back-to-back bookings (10:00–10:30 then 10:30–11:00, buffer 0) both succeed, because
`tsrange` is half-open and adjacency is legal. Testing only the rejection direction
hides an off-by-one that would block every consecutive booking. It also checks that the
range is over `blockedUntil`, that the `WHERE` clause covers `COMPLETED`, and that the
constraint is keyed by `staffId`. It has passed against production over Neon's pooled
connection, 9 of 9 checks; the expected output is recorded as a verbatim diff baseline
in `docs/14.3-prod-verification.md`. Re-run it after any migration touching `Booking`.

**Editing a service's duration must not recompute existing bookings.** `endAt` and
`blockedUntil` are snapshotted at creation, so a booking keeps the length it was booked
for even after the service definition changes. This is deliberate, not a bug: the
customer was told 30 minutes, and recomputing would silently reshuffle a day the owner
has already planned.

## Avoid overengineering — specifically

- No repository/service-layer framework beyond the plain functions in `lib/db/*`. A
  function that takes `tenantId` and returns data is enough. Don't introduce classes,
  dependency injection, or generic CRUD abstractions.
- No `Location` model or multi-location logic. Address/timezone live on `Tenant` directly.
  Opening hours live per staff member (`WorkingHours`) — there is no hours field on `Tenant`.
- No `StaffService` mapping table. Any active staff member can perform any active service.
- No generic plugin system for future business types (salon, massage, wellness). The
  `BusinessType` enum and plain service/staff model are already flexible enough — new
  verticals are additive migrations later, not something to design for now.
- No admin panel framework, no generic form builder, no config-driven UI generation.
- No REST API layer duplicating what Server Actions already do. Only add a Route Handler
  when something outside this app's own frontend needs to call in.
- Prefer the simplest data shape that solves today's requirement. If you're adding a field
  "in case it's needed later," don't — flag it instead and let it be a real decision.

## Practical conventions

- TypeScript strict mode, no `any` without a comment explaining why.
- **A script that ran and a test suite that passed are not evidence the types are
  sound.** `tsx` (scratch and diagnostic scripts) and Vitest's esbuild (test files)
  strip types rather than check them, so both accept code that `tsc` rejects. Two
  real cases in one session: a regex `s` flag, which needs an `es2018` target, and
  `globSync` from `node:fs`, which isn't in this project's `@types/node` — each ran
  cleanly under one tool and failed `npm run typecheck`. Always run `npm run typecheck`
  as its own step before trusting a script's output or a green suite, and especially
  before trusting a subagent that reports its tests passing — it may never have run
  `tsc` at all.
- **Never read an exit code from a command you piped through `tail`, `head`, `grep`
  or `wc`.** In bash and POSIX `sh`, `$?` reports the _last_ command in a pipeline, so
  `npm run probe:crud 2>&1 | tail -5; echo $?` prints `tail`'s status — always 0 — and
  a failing script reads as a passing one. Verified in this repo: `(exit 3) | tail -1`
  gives `$? = 0`, and without the pipe `3`. It has already produced one wrong claim
  here, a deliberately broken probe reported as exiting 0 while it was really exiting 1.
  When the exit code is the thing you care about, redirect instead of piping —
  `cmd > out.txt 2>&1; echo $?`, then read the file — or use `${PIPESTATUS[0]}` in bash.
  In PowerShell the hazard is narrower but the same shape: `$LASTEXITCODE` survives a
  pipe into a cmdlet and stays the native command's code, while `$?` becomes the
  cmdlet's and reads `True` over a failure. Read `$LASTEXITCODE` there, never `$?`.
  This applies to the probe scripts especially — their whole contract is the exit code.
- Zod for all input validation on server actions.
- Luxon for all date/time math — no raw `Date` arithmetic across timezones.
- An ESLint `no-restricted-imports` rule bans importing the Prisma client outside
  `lib/db/**`. If you hit that lint error, add a helper in `lib/db/*` — don't work around it.
- `Booking.cancelToken` is a bearer secret, not an identifier. Generate it with a
  cryptographically secure random source (e.g. `crypto.randomUUID()`) — never `cuid()`,
  `nanoid()` defaults, or anything else not designed to be unguessable.
- There is no hard-delete for `Staff` or `Service`. "Removing" either always means setting
  `active = false`. Both are `onDelete: Restrict` on `Booking` — existing bookings must not break.
- Every `DateTime` column stores a UTC instant with no timezone attached (Prisma's default
  Postgres mapping for `DateTime` is `timestamp` without timezone — this schema relies on
  that). Never write local wall-clock time directly into `startAt`/`endAt`/`blockedUntil`.
  Convert with Luxon using `tenant.timezone` only at the boundary — when parsing user input
  and when rendering for display. If a column is ever changed to `@db.Timestamptz`, the
  exclusion constraint's `tsrange` must change to `tstzrange` to match.
- Constants and types shared across the client/server boundary live in plain modules — never
  exported from a file marked `"use client"` or `"use server"`. Only components belong in a
  `"use client"` module's exports, and only async server actions in a `"use server"` module's.
  Both directives rewrite _every_ export in the file into a reference: a constant exported
  from a `"use client"` file arrives in a server component as a throwing client-reference
  proxy, and one exported from a `"use server"` file arrives on the client as a callable
  action proxy. Neither is a type error, so nothing warns you — the value is simply not the
  value, and it can appear to work for a while if it's only ever compared against itself.
  Both of these were real bugs here: `ANY_STAFF` exported from `staff-picker.tsx`, and a
  `useActionState` initial-state constant exported from a booking action module. To confirm a
  suspect export, check `.next/**/server-reference-manifest.json` — anything listed there
  with a non-function `exportedName` is being shipped as a reference.
- Gaps between JSX expressions use an explicit `{" "}`, never a literal space in the
  text. A text node sandwiched between two expressions and wrapped across lines has its
  leading space trimmed at build time — it shipped once as "closes 2 hbefore an
  appointment". An explicit `{" "}` is a real child and cannot be dropped.
- Auth.js v5 config is split: `auth.config.ts` holds only dependency-free config and is what
  `proxy.ts` imports; `auth.ts` holds the Prisma-backed Credentials `authorize`
  callback and only ever runs in the Node runtime. Never import the Prisma-backed config
  into `proxy.ts` — it runs on every matched request and has no reason to open a
  database connection.
- Never run `prisma db push` in this project — always `prisma migrate dev` / `deploy`.
  `db push` has no record of the hand-written exclusion constraint (Prisma can't express it
  in schema language) and will silently drop it as unrecognized drift.
- Prisma is pinned to v6 (`prisma@6`, `@prisma/client@6`). Prisma 7 requires driver adapters
  and moves connection config out of `schema.prisma` into `prisma.config.ts` — a real
  migration, not a bump. Don't let a dependency update carry it forward silently; revisit
  deliberately, later, once the MVP is stable.
- `CLAUDE.md` and `AGENTS.md` in this repo are hand-authored and are the source of truth.
  Prevent collisions structurally: scaffold into an empty temp directory, never directly
  into a folder that already holds these files, then copy the generated tree in. If a
  scaffolding tool offers to generate or update either file, decline it. Before any repo
  exists, verify by diffing against a pre-scaffolding snapshot; once a git history exists,
  diff against that instead. Anything a generator produced that conflicts with the
  hand-authored version is discarded, not merged.
- Booking confirmation and owner-notification emails are sent _after_ the booking is
  committed, awaited inside a try/catch — a failed send must never fail the booking, but it
  must also never be fire-and-forget. Vercel kills un-awaited work once the response is
  sent, so an un-awaited send silently never happens. Log send failures; don't retry inline.
- The public booking form is unauthenticated by design (no customer accounts). Per-phone
  rate limiting (a count query against recent `Booking`/`Customer` rows) ships in the MVP.
  Per-IP limiting needs a persistent store or external service since Vercel serverless has
  no shared in-memory state — that's a new dependency, so it waits for evidence of actual
  abuse and needs approval under rule 5 first, not built preemptively.
- The person you're working with uses PowerShell. Give commands as separate lines, not
  chained with `&&`.
- Plan mode for anything touching: schema, migrations, `lib/db/*`, `lib/auth/*`,
  `proxy.ts`, or the availability/slot computation logic. Implement freely, without
  a pre-approval step, for UI components, styling, seed scripts, and tests.
- When in doubt about scope, ask. A clarifying question costs a few seconds; unwinding
  unwanted scope costs an afternoon.
