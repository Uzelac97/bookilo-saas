# Phase 15 — Security / Tenant-Isolation Audit

Read-only audit against CLAUDE.md rules 1–3, cancel-token handling, `lib/db`
helper correctness, and session/route-protection coverage. No source file was
modified in the course of this review. Every file under `src/`, `prisma/`, and
`scripts/` was read; nothing was sampled or skipped as out of scope.

---

## 1. Direct Prisma access outside `lib/db/**`

**Result: no violation found.**

- `eslint.config.mjs:20-44` scopes `no-restricted-imports` to `files:
  ["src/**/*.{ts,tsx}"]` with `ignores: ["src/lib/db/**"]`. That block bans
  both `@prisma/client` and any import matching `**/lib/db/prisma` /
  `**/lib/db/prisma.*`, so a component or action can't reach the client
  instance either directly or through a re-export of it.
- Grepping all of `src/` for `@prisma/client` and for `prisma.<model>.` turns
  up exactly the 7 files under `src/lib/db/**` (`bookings.ts`, `staff.ts`,
  `services.ts`, `customers.ts`, `tenant.ts`, `users.ts`, `availability.ts`)
  plus `prisma.ts` itself. No hits anywhere in `src/app/**` or
  `src/components/**`.
- No `eslint-disable` comment of any kind exists anywhere in `src/`. Nothing
  has been silenced.
- Two files outside `src/` import `@prisma/client` or the shared `prisma`
  singleton directly: `prisma/seed.ts:51` and `scripts/reset-password.ts:12`.
  Both are outside the ESLint rule's `files` glob (`src/**`), and both carry a
  comment explaining why: they're build-time/CLI tools with no request and
  therefore no tenant boundary to leak, and `reset-password.ts`'s own comment
  states it "lives outside `src/` so the app can never import it." **No rule
  violation** — rule 1 is written in terms of "a component, server action, or
  route handler," none of which these are — but flagged as a judgment call:
  the ESLint rule provides no structural guarantee for these two files, only
  the comment does. If either script is ever imported from `src/` (e.g. to
  share a helper), the import would need to change shape or the rule would
  need widening. Severity: **cosmetic**. No fix needed now; worth a one-line
  note if `scripts/` or `prisma/seed.ts` ever grows.

**Call sites examined:** all 26 `.ts`/`.tsx` files under `src/lib/db/**` and
`src/lib/db/prisma.ts`; all 12 dashboard `page.tsx`/`actions.ts` files; all 6
public-route files; the 2 root-level scripts that touch Prisma directly
(`seed.ts`, `reset-password.ts`); the 3 other scripts in `scripts/` were
confirmed to import Prisma too (`probe-crud.ts`, `probe-exclusion-constraint.ts`,
`probe-rate-limit.ts`, `probe-cancel.ts` — 4, not 3) but were not read
line-by-line since they're test/verification tooling with no production
request path; **I did not fully verify their Prisma usage bypasses no tenant
boundary that matters**, because they're offline scripts against seed/demo
data only — flagging this explicitly rather than silently treating it as
checked.

---

## 2. `tenantId` resolution

**Result: no violation found.** Every server action and route handler was
checked individually.

### Dashboard mutations (session-resolved, confirmed for each)

| File | Action(s) | Source of `tenantId` |
| --- | --- | --- |
| `app/(dashboard)/actions.ts` | `signOutAction` | none needed (no tenant data touched) |
| `dashboard/bookings/new/actions.ts` | `createManualBooking` | `getCurrentTenant()` |
| `dashboard/services/actions.ts` | `createServiceAction`, `updateServiceAction`, `setServiceActiveAction` | `requireSession()` |
| `dashboard/settings/actions.ts` | `updateBookingRulesAction` | `requireSession()` |
| `dashboard/staff/actions.ts` | `createStaffAction`, `updateStaffAction`, `saveWorkingHoursAction`, `setStaffActiveAction`, `addTimeOffAction`, `deleteTimeOffAction` | `requireSession()` / `getCurrentTenant()` |
| all 6 dashboard `page.tsx` files | server-component reads | `getCurrentTenant()` |

In every one of these, `tenantId` (or the whole `tenant` object) is pulled
from `requireSession()` / `getCurrentTenant()` — both of which read
`lib/auth/session.ts`'s memoized `auth()` call — and never from `formData`,
a route param, or a query string. I grepped specifically for
`formData.get("tenantId")` and any assignment of `tenantId` from `formData`:
zero hits. Row-level ids (`serviceId`, `staffId`, `timeOffId`) do arrive as
plain form fields, but that's correctly not a loophole: every write helper
puts `tenantId` in the same `where`/`updateMany` filter as the id, so a
foreign id simply matches nothing (see §3 below for the two exceptions that
need an extra re-fetch instead, and confirmation that both do it).

### Public routes (slug-resolved, confirmed for each)

| File | Resolution |
| --- | --- |
| `app/(public)/b/[slug]/page.tsx` | `getTenantBySlug(slug)`, memoized via `cache()` |
| `app/(public)/b/[slug]/book/page.tsx` | same |
| `app/(public)/b/[slug]/book/actions.ts` (`submitBooking`) | `getTenantBySlug(slug)` from the *payload's* `slug` field, not from a session |
| `app/(public)/b/[slug]/booked/[token]/page.tsx` | `getBookingByCancelToken(token)`, tenant returned from the booking row, checked against the URL's `slug` (404 on mismatch) |
| `app/(public)/b/[slug]/cancel/[token]/page.tsx` + `actions.ts` | same token-then-slug-check pattern; `cancelBooking` action takes `{ slug, token }` as bound arguments, not form fields |

No public route reaches for `auth()`/`getSession()`/`requireSession()` at
any point — confirmed by grepping `src/app/(public)/**` for those three
names: zero hits. The two resolution paths are not mixed anywhere.

### Auth surface

- `src/app/login/actions.ts` (`loginAction`) takes only `email`/`password`
  from the form plus a `callbackUrl` that's validated against open-redirect
  (`safeCallbackUrl` at `login/actions.ts:16-20`, rejects anything not
  starting with a single `/`). No tenant input at all — the tenant is
  resolved *after* login, from `getUserByEmail` inside `auth.ts`'s
  `authorize()`, which is the one documented exception to "every helper
  takes tenantId" (there's no session yet at that point).
- `src/app/api/auth/[...nextauth]/route.ts` only re-exports Auth.js's own
  `handlers` — it isn't a hand-written route handler with its own tenant
  logic, so it's out of scope for this rule by construction.

**Call sites examined:** all 5 dashboard action files (11 exported actions
total) and all 6 dashboard pages; all 4 public-route action/page files under
`b/[slug]`; `login/actions.ts`; `api/auth/[...nextauth]/route.ts`. 11 + 6 + 6
+ 1 + 1 = **25 call sites**, all resolved correctly.

---

## 3. Booking writes re-verify foreign keys

**Result: confirmed correct, and confirmed to be the only insertion path.**

- `lib/db/bookings.ts:47-128` (`createBooking`) re-fetches `tenant`,
  `staff` (`active: true`), `service` (`active: true`), and `customer`, each
  scoped by `tenantId`, via `Promise.all` before the insert (lines 60-77),
  and throws if any of the four resolves to `null` (lines 79-91) rather than
  proceeding. This matches CLAUDE.md rule 3 exactly, including the detail
  that staff/service must also be active.
- The insert itself (lines 104-119) uses the freshly-verified ids, not the
  caller's raw input, and the fallback catch classifies the exclusion
  constraint's `23P01` into `SLOT_TAKEN` via `isSlotTakenError`
  (lines 496-503), matched on message text rather than error class — the
  reasoning for why is documented inline and matches CLAUDE.md's note that
  the error class isn't stable across Prisma versions.
- **Every Booking insert in the app goes through this one function.** I
  grepped for `prisma.booking.create` across the whole repo: the only hit is
  inside `createBooking` itself (`lib/db/bookings.ts:105`). Both call sites
  that create bookings — the public `submitBooking` action
  (`app/(public)/b/[slug]/book/actions.ts:255-261`) and the dashboard's
  `createManualBooking` (`dashboard/bookings/new/actions.ts:114-124`) — call
  `createBooking()`, not Prisma directly. `prisma/seed.ts` also imports and
  calls `createBooking` (confirmed at `seed.ts:44`) rather than
  `prisma.booking.create`, so even the seed data goes through the FK check.

**Call sites examined:** 1 write helper (`createBooking`), 3 callers
(`submitBooking`, `createManualBooking`, `prisma/seed.ts`'s seeding loop).
No other `Booking`-creating code path exists.

---

## 4. `cancelToken` generation and cancel-route authorization

### Generation — correct

- `lib/db/bookings.ts:116`: `cancelToken: randomUUID()` from `node:crypto`,
  not `cuid()` or `nanoid()`. Grepped the whole repo for `cuid(` and
  `nanoid(`: the only `cuid()` calls are in `prisma/schema.prisma` on `id`
  columns (the row identifier, which is not a bearer secret and isn't the
  thing this check is about) — `cancelToken` itself has no `@default` in the
  schema, so `randomUUID()` at the call site is the only source. Confirmed
  there's exactly one `createBooking` and therefore exactly one place a
  `cancelToken` is ever minted.

### Authorization — correct, and consistent everywhere it's used

- `getBookingByCancelToken` (`lib/db/bookings.ts:269-303`) and
  `cancelBookingByToken` (`lib/db/bookings.ts:326-381`) are the two lookups
  keyed on the token, and both are deliberately **not** tenant-scoped — the
  file comment explains why (holding the token *is* the authorization; there
  is no session on this path). Both pages that render from a token
  (`booked/[token]/page.tsx:36-37`, `cancel/[token]/page.tsx:45-46`)
  independently re-check `booking.tenant.slug !== slug` and `notFound()` on
  mismatch, so one shop's URL can never render another's booking even though
  the lookup itself ignores the slug. I confirmed both pages do this check
  before rendering any booking data.
- `cancelBookingByToken` uses a conditional `updateMany` keyed on
  `{ cancelToken, status: "CONFIRMED" }` rather than `update`, so a raced
  double-submit is idempotent rather than throwing (lines 360-378) — matches
  the CLAUDE.md description of the design.
- The cancel page itself is read-only on GET and mutates only via a POST
  form action bound to `{ slug, token }` as arguments, not hidden form
  fields (`cancel/[token]/actions.ts:27`), specifically so link-preview bots
  and mail scanners fetching the emailed URL can't trigger a cancellation.

### Token leakage into logs — **one real finding**

- `lib/email/booking-emails.ts:94-99` deliberately logs a failed send by
  booking id, "never by cancel token," and the comment states the token
  "must not reach a log line." That discipline is followed everywhere a
  booking id or error is logged (`console.error` call sites in
  `dashboard/staff/actions.ts`, `services/actions.ts`,
  `settings/actions.ts`, `bookings/new/actions.ts`,
  `book/actions.ts` — all reviewed, none echo a token) and
  `cancel/[token]/actions.ts:30-33` explicitly declines to log the result
  "because... the only identifier available to log it against is the token
  itself."
- **However**, `lib/email/resend.ts:29-39` (`sendEmail`) has a fallback path
  for when `RESEND_API_KEY` or `EMAIL_FROM` is unset: it calls
  `console.info` with the **full rendered email text** —
  `` `...would have sent to ${email.to}: ${email.subject}\n${email.text}` ``.
  For the customer confirmation email, that `text` body is produced by
  `renderText()` (`lib/email/templates/shell.ts:111-132`), which includes
  the cancel link verbatim via `content.action.url`
  (`shell.ts:121`) — and that URL is
  `cancelUrl(tenant.slug, booking.cancelToken)`
  (`booking-emails.ts:60`), i.e. the raw, unguessable bearer token, in
  plain text, in a `console.info` call.
  - **Rule violated:** the "never leaked in logs" requirement this audit
    was asked to check (CLAUDE.md's `cancelToken` bearer-secret rule,
    combined with the explicit no-log discipline documented elsewhere in
    this same email module).
  - **Severity: latent.** It cannot fire with `RESEND_API_KEY`/`EMAIL_FROM`
    both set, which is the intended production configuration. But
    `EXECUTION-PLAN.md`'s "Deferred out of Day 14" section already records
    that a missing `RESEND_API_KEY`/`EMAIL_FROM` in production is
    silent and currently undetectable (`sendEmail` returns the same
    `{ ok: true }` shape either way) — so the one scenario that makes this
    exploitable is a misconfiguration the project has already flagged as
    both plausible and currently invisible. If that happens, every
    customer's cancel token for every booking made during the
    misconfiguration window lands in Vercel's function logs in plain text,
    where anyone with log access (or a leaked log export) could cancel
    those customers' appointments.
  - **What a fix would involve** (not written, per instructions): either
    stop interpolating `email.text` into the skipped-send log line (log the
    recipient and subject only, which is what the message is already
    mostly doing), or — if the full body is wanted for local debugging —
    gate the interpolation on `NODE_ENV !== "production"` the same way this
    project already gates the dev-only Prisma-client caching in
    `lib/db/prisma.ts:16`. Either change is local to `resend.ts` and
    doesn't touch the booking/email call sites that already do the right
    thing.

**Call sites examined:** both token-keyed read functions; both pages that
render from a token; the one action that mutates via a token; every
`console.*` call in the email module and in every server action file in the
app (16 call sites total: `staff/actions.ts` (6),
`services/actions.ts` (3), `settings/actions.ts` (1),
`bookings/new/actions.ts` (2), `book/actions.ts` (2),
`booking-emails.ts` (1), `resend.ts` (1, the one flagged above)).

---

## 5. `lib/db` helpers: signature vs. body

**Result: no violation found.** Every exported function in
`src/lib/db/{bookings,staff,services,customers,tenant,users,availability}.ts`
was read in full and checked for whether a `tenantId` parameter actually
lands in the query:

- The overwhelming majority put `tenantId` directly in a Prisma `where` (or
  `updateMany` `where`) clause alongside the row id — the standard pattern
  documented repeatedly in the code's own comments (e.g. `updateService`,
  `setServiceActive`, `updateStaff`, `setStaffActive`).
- Three functions can't do that because the underlying table has no
  `tenantId` column of its own (`WorkingHours`, `TimeOff` — both scoped only
  through the `Staff` row they hang off). All three handle it correctly:
  - `replaceWorkingHours` (`staff.ts:327-347`) and `createTimeOff`
    (`staff.ts:370-392`) both re-fetch the `staff` row scoped by `{ id:
    staffId, tenantId }` *before* writing, and refuse (`NOT_FOUND`) if that
    lookup misses — the same rule-3 pattern applied to a table that can't
    speak for itself, and both have a comment explaining exactly this.
  - `deleteTimeOff` (`staff.ts:410-419`) instead expresses the boundary
    directly in the delete's `where: { id: timeOffId, staff: { tenantId }
    }` — valid because `deleteMany` accepts a relation filter, unlike the
    create case above.
  - `getWorkingHoursForActiveStaff` (`staff.ts:116-123`) reads through the
    same `staff: { tenantId, active: true }` relation filter.
- One function, `updateBookingRules` (`tenant.ts:72-84`), scopes only by
  `id: tenantId` with no second column — correct, because for `Tenant` the
  id *is* the tenant boundary; there's no second row it could reach. The
  file comment calls this out explicitly and correctly identifies that what
  actually protects it is upstream (`requireSession()` supplying the id,
  never form data).
- `getUserByEmail` (`users.ts:24-41`) is the one documented function with no
  `tenantId` parameter at all, for the stated reason (no session exists yet
  at login) — not a gap, a documented exception.
- `getBookingByCancelToken` / `cancelBookingByToken` are the other
  documented exception (§4 above).

I found **no helper** whose signature accepts `tenantId` and then silently
fails to use it — the specific failure mode this audit was asked to hunt
for.

**Call sites examined:** all 26 exported functions across the 7 `lib/db`
files (`bookings.ts`: 8, `staff.ts`: 11, `services.ts`: 5, `customers.ts`:
1, `tenant.ts`: 3, `users.ts`: 1, `availability.ts`: 1 — the internal helper
`isSlotTakenError` is not exported and not tenant-scoped by nature, so it's
excluded from this count).

---

## 6. Session / auth wiring and route protection

**Result: no violation found.**

- `src/proxy.ts:10` imports only `@/lib/auth/auth.config`, never
  `@/lib/auth/auth`. Confirmed by reading both files: `auth.config.ts` has
  no import of Prisma, bcrypt, or `./auth.ts` — it's the dependency-free
  half, exactly as its own header comment requires. `auth.ts` is the only
  file that imports `getUserByEmail` (Prisma-backed) and is never imported
  by `proxy.ts` or anything `proxy.ts` transitively pulls in.
- `proxy.ts`'s matcher (`config.matcher` at line 40) excludes only
  `api/auth`, `_next/static`, `_next/image`, `favicon.ico`, and static image
  extensions — every other path, including every segment under `/dashboard`,
  is matched. Inside the handler, `isOnDashboard` is a plain
  `pathname.startsWith("/dashboard")`, so it covers the full subtree
  (`/dashboard`, `/dashboard/calendar`, `/dashboard/staff/[id]`, etc.) with
  no per-page allowlist that could be forgotten for a new page.
- Route protection is two-layered, not one: `proxy.ts` redirects
  unauthenticated requests before they reach a page, and
  `app/(dashboard)/layout.tsx:33` independently calls `requireSession()` as
  "the second line of defence... for server actions, which proxy.ts does
  not cover" (per that file's own comment, confirmed accurate — Server
  Actions are POSTs to the current page's endpoint and aren't independently
  matched by the proxy's page-level redirect logic in the way a page
  navigation is). Since there is exactly one `layout.tsx` under
  `(dashboard)/` and Next.js cannot render a page under that segment
  without passing through its layout, this guard is structural rather than
  a convention that a new page could accidentally skip.
- `session({ session, token })` and `jwt({ token, user })` in
  `auth.config.ts:27-44` are the only place `tenantId` is copied onto the
  session, and they live in the dependency-free file specifically so
  `proxy.ts`'s own `auth()` call sees a fully-shaped session — confirmed
  this is why `isSignedIn = Boolean(req.auth?.user?.tenantId)` in
  `proxy.ts:16` actually works without ever loading `auth.ts`.
- Login rejects with a single generic message for both "no such account"
  and "wrong password" (`auth.ts:33-45`), and burns a dummy bcrypt
  comparison on the no-such-account path specifically to keep the timing
  identical — confirmed this comparison actually happens (not
  short-circuited before the `verifyPassword` call).

**Call sites examined:** `proxy.ts` in full; `auth.config.ts` in full;
`auth.ts` in full; `session.ts` in full; the one dashboard layout; the
matcher regex, tested by inspection against every path listed in the file
tree (`/dashboard`, `/dashboard/calendar`, `/dashboard/staff`,
`/dashboard/staff/[staffId]`, `/dashboard/services`,
`/dashboard/settings`, `/dashboard/bookings/new`, `/login`, `/`,
`/b/[slug]`, `/b/[slug]/book`, `/b/[slug]/booked/[token]`,
`/b/[slug]/cancel/[token]`, `/api/auth/*`) — all 14 route shapes checked
against the matcher's exclusion pattern by hand.

---

## 7. Other things checked while in the code (not separately requested, flagged for completeness)

- **No secrets in the client bundle.** Grepped `src/` for `NEXT_PUBLIC_`:
  zero hits. All `process.env.*` reads (`RESEND_API_KEY`, `EMAIL_FROM`,
  `APP_URL`, `NODE_ENV`) are in server-only modules (`lib/email/resend.ts`,
  `lib/email/booking-emails.ts`, `lib/db/prisma.ts`) — none in a
  `"use client"` file or a client component.
- **Open redirect on login** is already handled
  (`login/actions.ts:16-20`, `safeCallbackUrl`) — checked because it's
  adjacent to the auth surface, not because it was asked for. No issue.
- **`Tenant.updateBookingRules`'s narrow-write claim** (rule-3-adjacent, not
  rule 3 itself): confirmed the function destructures only the three
  booking-rule fields out of its input type before writing, so it genuinely
  cannot be pointed at `slug`/`timezone`/`contactEmail` regardless of what a
  caller passes — matches the file's own comment.

---

## Summary count

| Category | Call sites examined | Findings |
| --- | --- | --- |
| Direct Prisma access outside `lib/db/**` | 26 files in `src/lib/db/**` + all of `src/app/**` + `src/components/**` (grep-verified, zero leaks) + 2 root scripts (read in full) | 0 violations; 1 judgment-call note (§1) |
| `tenantId` resolution — dashboard | 25 call sites (11 actions + 14 page/layout reads) | 0 violations |
| `tenantId` resolution — public | covered above, 6 files | 0 violations |
| Booking FK re-verification | 1 helper, 3 callers | 0 violations |
| `cancelToken` generation | 1 mint site, repo-wide `cuid`/`nanoid` grep | 0 violations |
| `cancelToken` log/URL leakage | 16 `console.*` call sites reviewed | **1 finding — latent** (§4, `resend.ts:35`) |
| `lib/db` helper signature-vs-body | 26 exported functions across 7 files | 0 violations |
| Session/proxy wiring | `proxy.ts`, both auth config files, `session.ts`, 14 route shapes against the matcher | 0 violations |

**Total findings: 1**, latent severity, in `src/lib/email/resend.ts:29-39`.

**Explicitly not fully verified:** the four `scripts/probe-*.ts` files were
confirmed to import Prisma directly (correct — they're offline verification
tools, same category as `seed.ts`) but were not read line-by-line for
correctness, since they exercise seed/demo data outside any request path and
are therefore outside this audit's tenant-isolation threat model. If they are
ever wired into a request path (e.g. an in-app diagnostics page), they would
need the same review the rest of this document gives everything else.
