# Bookilo

Online booking for barbershops and hair salons. Each shop gets a public booking
page at `/b/{slug}` that its customers use without an account, and an owner
dashboard at `/dashboard` for the calendar, staff, services, and settings.

`bookilo-saas` is both the repository and the Vercel project name. Production data
lives in the Neon project `bookilo-prod`, separate from the development one. None
of it is user-facing. An earlier decision kept the original `barber-saas` name;
that was reversed, and the correction is recorded in `EXECUTION-PLAN.md`.

## Stack

- Next.js (App Router) with Server Actions — no separate API layer
- Postgres on Neon, via Prisma 6
- Auth.js v5, credentials provider, owner accounts only
- Luxon for all date/time math
- Resend for transactional email
- Tailwind CSS
- Vitest

## Getting started

```
npm install
```

Copy `.env.example` to `.env` and fill it in. `DATABASE_URL`, `DIRECT_URL`, and
`AUTH_SECRET` are the three you cannot start without. Leave `RESEND_API_KEY` and
`EMAIL_FROM` blank locally — the booking flow then logs each email it would have
sent instead of sending it, so the whole flow works end to end with no
credentials on the machine.

```
npx prisma migrate dev
npm run db:seed
npm run dev
```

The seed creates one demo tenant, `kastanien-barbershop`, with staff, services,
and working hours. Sign in with `SEED_OWNER_EMAIL` / `SEED_OWNER_PASSWORD`
(defaults in `.env.example`).

- Public booking page: http://localhost:3000/b/kastanien-barbershop
- Owner dashboard: http://localhost:3000/login

## Checks

```
npm run typecheck
npm run lint
npm test
```

`npm run typecheck` is not optional and not implied by the other two. Vitest
strips types rather than checking them, so a green suite says nothing about
whether `tsc` accepts the code.

## Working on this codebase

Read `CLAUDE.md` first — it holds the non-negotiable rules, chiefly that every
tenant-owned query goes through `lib/db/*` with an explicit `tenantId`. Scope
lives in `EXECUTION-PLAN.md`; the path to launch is in `V1-LAUNCH-PLAN.md`.

Two things that are easy to break without noticing:

- `prisma db push` must never be run here. The double-booking guarantee is a
  hand-written Postgres exclusion constraint that Prisma's schema language
  can't express, so `db push` sees it as unrecognized drift and drops it.
  Always `prisma migrate dev` / `prisma migrate deploy`.
- Every `DateTime` column is a UTC instant. Convert with Luxon against
  `tenant.timezone` only at the boundary — parsing input, and rendering output.
