# CLAUDE.md

Rules for working on this codebase. Read this before planning or implementing anything.

## Project context

Barbershop booking SaaS MVP. Solo developer, shipping toward first paying customers, not
toward a large-team-scale architecture. Source of truth for scope: `EXECUTION-PLAN.md` and
`prisma/schema.prisma`. If a request seems to go beyond what's in those files, say so and
ask before building it — don't silently expand scope.

## Non-negotiable rules

1. **Every tenant-owned query goes through `lib/db/*`.** Never call `prisma.<model>.findMany`
   (or any Prisma method) directly from a component, server action, or route handler for
   `Booking`, `Staff`, `Service`, `Customer`, or `User`. Always go through the scoped
   helper functions, and always pass `tenantId` explicitly. If a helper doesn't exist yet
   for what you need, add one to `lib/db/*` rather than reaching for `prisma` directly.

2. **Dashboard mutations resolve `tenantId` from the server-side session, never from
   client input.** If you're writing a server action for an authenticated route, get the
   tenant from `getCurrentTenant()` / the session — do not accept a `tenantId` field from
   the request body or form data.

2a. **Every write to `Booking` re-verifies its foreign keys before inserting.** A Prisma
    foreign key only checks that a `staffId`/`serviceId`/`customerId` row exists somewhere —
    not that it belongs to the tenant making the request. Before creating a `Booking`, the
    write helper in `lib/db/bookings.ts` must re-fetch the staff/service/customer scoped by
    `tenantId` and fail if any of them don't belong to that tenant. This is the only thing
    standing between a bug and one tenant's booking pointing at another tenant's staff.

3. **Any change to `prisma/schema.prisma` or any migration file requires a plan first,
   in plain language, before you write it.** Explain what's changing and why. Wait for
   approval. This includes adding fields, not just new models.

4. **Do not add a new npm dependency without asking first**, including "small" ones. State
   what it's for and what the alternative would be without it.

5. **Do not build anything listed as excluded in `EXECUTION-PLAN.md`** (staff login,
   SMS/WhatsApp, payments, multi-location, analytics, customer accounts, i18n, marketplace
   features, POS/inventory) unless explicitly asked to start that phase.

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
  cleanly under one tool and failed `npm run typecheck`. Always run `npm run
  typecheck` as its own step before trusting a script's output or a green suite,
  and especially before trusting a subagent that reports its tests passing — it may
  never have run `tsc` at all.
- **Never read an exit code from a command you piped through `tail`, `head`, `grep`
  or `wc`.** In bash and POSIX `sh`, `$?` reports the *last* command in a pipeline, so
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
  Both directives rewrite *every* export in the file into a reference: a constant exported
  from a `"use client"` file arrives in a server component as a throwing client-reference
  proxy, and one exported from a `"use server"` file arrives on the client as a callable
  action proxy. Neither is a type error, so nothing warns you — the value is simply not the
  value, and it can appear to work for a while if it's only ever compared against itself.
  Both of these were real bugs here: `ANY_STAFF` exported from `staff-picker.tsx`, and a
  `useActionState` initial-state constant exported from a booking action module. To confirm a
  suspect export, check `.next/**/server-reference-manifest.json` — anything listed there
  with a non-function `exportedName` is being shipped as a reference.
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
- Booking confirmation and owner-notification emails are sent *after* the booking is
  committed, awaited inside a try/catch — a failed send must never fail the booking, but it
  must also never be fire-and-forget. Vercel kills un-awaited work once the response is
  sent, so an un-awaited send silently never happens. Log send failures; don't retry inline.
- The public booking form is unauthenticated by design (no customer accounts). Per-phone
  rate limiting (a count query against recent `Booking`/`Customer` rows) ships in the MVP.
  Per-IP limiting needs a persistent store or external service since Vercel serverless has
  no shared in-memory state — that's a new dependency, so it waits for evidence of actual
  abuse and needs approval under rule 4 first, not built preemptively.
- The person you're working with uses PowerShell. Give commands as separate lines, not
  chained with `&&`.
- Plan mode for anything touching: schema, migrations, `lib/db/*`, `lib/auth/*`,
  `proxy.ts`, or the availability/slot computation logic. Implement freely, without
  a pre-approval step, for UI components, styling, seed scripts, and tests.
- When in doubt about scope, ask. A clarifying question costs a few seconds; unwinding
  unwanted scope costs an afternoon.
