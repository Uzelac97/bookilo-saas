# barber-saas — v1 Launch Plan

**Decision recorded:** single codebase, single architecture. Target = barber shops + hair salons only. Differentiation is terminology, branding, and demo seed data. No new domain entities (`Resource`, `Room`, `Equipment` all deferred).

**Guiding constraint:** you have zero paying customers. Every task below is scored on whether it changes the odds of a Stuttgart shop owner saying yes. Things that don't are deferred, not because they're wrong, but because they're not evidence.

---

## Phase order at a glance

| Phase | What | Gate |
|---|---|---|
| **14** | First production deploy | Blocks everything — you cannot demo from localhost |
| **15** | Security & tenant-isolation audit | Blocks real customer data |
| **16** | Salon vertical + DEMO.md | Blocks salon demos |
| **17** | Code quality pass | **After** first 3–5 demos |

Do not reorder. Phase 17 before demos is the trap.

---

## Phase 14 — Production deploy

Everything here is a hard blocker. The project has never been imported to Vercel.

### 14.1 — Env & config prep (local)

- New `RESEND_API_KEY` (fresh `chairlyy` Resend account) in local `.env`
- Grep and replace hardcoded `milan.uzelac1997@gmail.com` — owner notifications will silently fail otherwise, since sandbox now only permits `chairlyy@gmail.com`
- Resend `from` → display name format
- Inventory every env var the app reads, so nothing is missing in Vercel

### 14.2 — Vercel project creation

- Import `barber-saas` (never imported — the Import button in the Vercel UI confirms this)
- Set env vars for Production
- Watch for `AUTH_URL` / `NEXTAUTH_URL` — Auth.js v5 commonly breaks in prod on this alone

### 14.3 — Production database

- **New Neon branch for prod.** Do not point prod at your dev database. Demo seed data and dev experiments must not share a database with anything you'd show a customer.
- Pooled vs direct URL split must be correct for Vercel serverless
- First-ever `prisma migrate deploy` against prod

### 14.4 — Seed + verify

- Seed the barber demo tenant on prod
- Full click-through as owner and as customer, on the live URL, on your phone

### 14.5 — Prod-only risk checks

These are things that pass locally and can fail in prod:

- **Exclusion constraint under Neon pooled connections.** You proved double-booking prevention under real concurrency locally. Serverless + pgBouncer is a different execution environment. Re-prove it in prod.
- **Auth.js edge/Node split on real Vercel edge runtime**
- **Root URL** currently renders "Shop not found" — a customer-facing error at the bare domain. Cheap fix, do it now.

---

## Phase 15 — Security & isolation audit

Half a day. This is the only pre-launch review that matters, because these are the failures you cannot recover from reputationally.

- Tenant scoping verified on **every** query path — one shop seeing another's bookings is unrecoverable
- Auth enforced on every dashboard route and server action
- No secrets in the client bundle
- Cancellation token unguessable and not enumerable
- Rate limiting on the public booking endpoint (it's unauthenticated and world-reachable)
- Prisma migration history clean and applied

Also worth a narrow pass: **accessibility on the public booking page only.** Keyboard navigation and contrast. Not a full WCAG audit — but this is the one page whose audience you don't control.

---

## Phase 16 — Salon vertical + demo material

- `Tenant.vertical` enum (`BARBER | SALON`) + terminology map (`staffLabel`, `serviceLabel`, etc.)
- Second seed file: salon demo tenant with authentic services and staff names
- `DEMO.md` in the repo

**DEMO.md must explicitly state:** during a demo, book using *your own* email (`chairlyy@gmail.com`). Never the prospect's. Resend is in sandbox mode without a verified domain — a prospect's address will silently fail. This is the single most likely way the demo breaks in front of a real person.

DEMO.md should also carry: the exact walkthrough order, what to say at each screen, the reset-before-meeting command, and honest answers to known rough edges (no payments, no SMS, no POS).

---

## Phase 17 — Code quality pass (AFTER first demos)

Deferred deliberately. None of these are why a barber says no, and half of what you'd "fix" now gets rewritten once real usage tells you what's actually wrong.

Categories to review when you get here: duplicated code, dead code, unnecessary complexity, naming consistency, architecture boundaries, TypeScript strictness gaps, React/Next.js patterns, Prisma query efficiency (N+1s), performance, UI consistency.

---

## Claude Code prompts

Run these one phase at a time. Review each plan before approving. Manual-approve mode for anything touching writes, schema, auth, or tenant boundaries.

### Prompt 14.1 — Env prep

```
Day 14, step 1 of the production deploy. Local changes only — no deploy yet.

Context: I created a new Resend account under chairlyy@gmail.com. The old
account (milan.uzelac1997@gmail.com) and its API key are dead. The new account
has no verified domain, so it is in sandbox mode: outbound email can ONLY be
delivered to chairlyy@gmail.com.

Tasks:
1. Grep the entire repo for milan.uzelac1997@gmail.com — including seed files,
   env examples, test fixtures, and any hardcoded owner-notification address.
   Report every occurrence with file and line before changing anything.
2. Change the Resend `from` field to use a display name while keeping the
   address as onboarding@resend.dev (domain is not verified).
3. Produce a complete inventory of every environment variable this app reads
   at build time and at runtime, with which are required vs optional, and
   which are server-only vs public. I need this list to configure Vercel.

Do not deploy. Do not change the Resend API key value — I have already updated
.env locally. Report findings first, then propose the plan.
```

### Prompt 14.2 — Vercel + prod database

```
Day 14, step 2: first-ever production deploy. This project has NEVER been
imported into Vercel — treat this as first-time setup, not a redeploy.

Plan (do not execute yet) covering:
1. Vercel project creation and env var configuration, using the inventory
   from step 1.
2. Auth.js v5 production config — specifically AUTH_URL/NEXTAUTH_URL and
   anything else that differs between local and Vercel. Flag known failure
   modes for the edge/Node split (auth.config.ts vs auth.ts) on real Vercel
   edge runtime.
3. Neon: I want a NEW branch for production, separate from dev. Explain the
   pooled vs direct connection string split and exactly which one each env
   var should get for Vercel serverless.
4. First `prisma migrate deploy` against the new prod branch — what could
   fail and how we'd know.
5. Seeding the barber demo tenant on prod.

For each step, tell me explicitly which parts you can verify yourself and
which require me to check manually in a browser or dashboard. Do not claim
anything is verified that you cannot actually observe.
```

### Prompt 14.3 — Prod verification

```
Day 14, step 3: verify the production deployment.

Two things passed locally that I do not trust in production until re-proven:

1. The Postgres exclusion constraint preventing double-booking. It was proven
   under real concurrency locally, but Neon pooled connections via pgBouncer
   in a serverless environment are a different execution context. Design a
   test that proves it still holds in prod, and tell me the raw output I
   should expect to see.

2. The Auth.js edge/Node split on the real Vercel edge runtime.

Also: the root URL currently renders "Shop not found", a customer-facing
error page at the bare domain. Propose a fix (landing page or redirect).

Give me a manual verification checklist — exact click-throughs to perform on
the live URL as both owner and customer, and what correct behaviour looks
like for each.
```

### Prompt 15 — Security audit

```
Pre-launch security and data-isolation audit. Scope is deliberately narrow:
only failures that leak data, lose data, or allow unauthorised access.
Do NOT review code style, naming, duplication, or performance.

Audit and report (no fixes yet):
1. Tenant scoping on every query path. tenantId must always be sourced
   server-side. Report any query that could return another tenant's data.
2. Auth enforcement on every dashboard route and server action.
3. Any secret reachable from the client bundle.
4. Cancellation token: entropy, enumerability, expiry.
5. Rate limiting on the public booking endpoint — it is unauthenticated and
   world-reachable.
6. Prisma migration history integrity.

Separately, a narrow accessibility pass on the PUBLIC BOOKING PAGE ONLY:
keyboard navigation and colour contrast. Not a full WCAG audit.

Report findings ranked by severity before proposing any changes.
```

### Prompt 16 — Salon vertical + DEMO.md

```
Add hair salon support and demo material. Terminology and seed data only —
no new domain entities. Resource, Room, and Equipment are explicitly deferred.

1. Add a `vertical` field to Tenant (BARBER | SALON) plus a terminology map
   so owner-facing UI labels change ("Barbers" vs "Stylists", etc.). Propose
   the migration. Internal code stays generic (staff, service, booking).
2. A second seed file for a salon demo tenant with authentic German salon
   services and staff names.
3. DEMO.md in the repo.

DEMO.md must include, prominently:
- Resend is in sandbox mode (no verified domain). During a demo I must book
  using MY OWN email (chairlyy@gmail.com). A prospect's address will silently
  fail. This is a known demo risk and must be stated at the top.
- The exact walkthrough order and what to say at each screen.
- The reset-before-meeting command.
- Honest answers for known gaps: no payments, no SMS reminders, no POS.

Plan first.
```

### Prompt 17 — Code quality (only after demos)

```
Post-demo code quality review. Report only — no changes yet.

Identify, with file and line references:
- duplicated code
- dead code (unreferenced exports, unused components, orphaned utils)
- unnecessary complexity / premature abstraction
- naming inconsistencies
- architecture boundary violations
- TypeScript gaps (any, unsafe casts, missing discriminated unions)
- React/Next.js anti-patterns (client components that should be server,
  missing suspense boundaries, waterfalls)
- Prisma issues (N+1 queries, missing indexes, over-fetching)
- UI inconsistencies

Rank by impact. For each, state whether it is a real problem or a
stylistic preference. I want to fix the first category and consciously
ignore the second.
```

---

## What only you can verify

Claude Code cannot confirm any of these. Do them yourself:

- A confirmation email actually landing in `chairlyy@gmail.com` — **and whether it lands in inbox or spam.** `onboarding@resend.dev` with no verified domain is frequently filtered. If it goes to spam, that is a demo risk to write into DEMO.md.
- The live Vercel URL loading and working on your **phone**, on mobile data, not just your laptop
- The full owner + customer click-through in a real browser
- Raw output of the prod concurrency test
- That the demo tenant looks credible to someone who cuts hair for a living

---

## The part that isn't a task

You are 14 days in, with a working product and zero conversations with a paying customer. Ship Phase 14, do the Phase 15 audit, then go into five Stuttgart barbershops. Phase 16 and 17 will be better work after those conversations than before them — and one of those conversations may make half this plan irrelevant, which would be the most valuable outcome available to you this week.
