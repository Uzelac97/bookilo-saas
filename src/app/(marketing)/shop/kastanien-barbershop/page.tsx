import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";

import { GrainOverlay } from "@/components/marketing/grain-overlay";
import { HERO_SENTINEL_ID } from "@/components/marketing/hero-sentinel";
import { SiteNav } from "@/components/marketing/site-nav";
import {
  WEEKDAY_LABELS,
  mergeOpeningHours,
  type DayOpeningHours,
} from "@/lib/availability/opening-hours";
import { getActiveServices, type PublicService } from "@/lib/db/services";
import { getWorkingHoursForActiveStaff } from "@/lib/db/staff";
import { getTenantBySlug } from "@/lib/db/tenant";
import { formatDuration, formatMinuteOfDay, formatPrice } from "@/lib/format";
import {
  categoryLabel,
  groupCategoryEn,
  serviceName,
} from "@/lib/i18n/service-text";
import { groupByCategory } from "@/lib/service-groups";

/**
 * Kastanien Barbershop's marketing page.
 *
 * ONE SHOP, ONE ROUTE, HARDCODED. Not `[slug]`, not a template, not a
 * component library a second tenant can adopt. Generalising this is Phase 16
 * (Tenant.vertical and the terminology map), which isn't built, and inventing
 * half of it here would be exactly the speculative scope CLAUDE.md rules out.
 *
 * It is also not Bookilo's landing page — that's Phase 16a, a different page
 * with a different audience. Nothing here names, badges, or links to the
 * product; someone reading this page is the shop's customer.
 *
 * EVERY PRICE, DURATION, NAME, HOUR, ADDRESS AND PHONE NUMBER COMES FROM THE
 * TENANT'S OWN ROWS, read live through lib/db on every request. Nothing about
 * the shop's offering is transcribed into this file, so an owner editing a
 * price in the dashboard cannot leave this page quoting a stale one.
 *
 * ONE DELIBERATE EXCEPTION, AND ONLY ONE: the About section's copy. It is
 * hand-written marketing text living in this file, not data. Tenant has no
 * column for a shop's story and adding one is a schema migration, which is out
 * of scope here (CLAUDE.md rule 3 — migrations need their own plan and
 * approval). It is hardcoded knowingly rather than invented and passed off as
 * data: it is the shop's approved copy, and it is the only prose on the page
 * that is not a database value. If a `Tenant.about` field ever lands, this is
 * the one block that moves.
 *
 * The two photographs are likewise real files under public/kastanien/, not
 * anything the schema knows about.
 */

/**
 * RENDERED PER REQUEST, NOT PRERENDERED.
 *
 * Every other tenant-facing route in this app is dynamic because it has a
 * `[slug]` or `[token]` param. This one has a constant slug and no params at
 * all, so Next happily static-prerenders it — the first build marked it `○
 * (Static)` — and a static build bakes in whatever the services table held at
 * build time. The prices, durations and opening hours below would then keep
 * quoting a menu the owner had already edited in the dashboard, until the next
 * deploy. On a page whose entire premise is that its copy is the shop's real
 * data, that is the one failure mode worth spending a query on.
 *
 * The cost is two indexed reads per view on a page that exists to be handed out
 * after an in-person pitch. ISR (`revalidate`) would be the cheaper trade, but
 * it introduces a staleness window this app has nowhere else, for traffic that
 * does not need it.
 */
export const dynamic = "force-dynamic";

const SHOP_SLUG = "kastanien-barbershop";

/**
 * The existing, end-to-end-tested booking flow. Every CTA on this page points
 * here and nowhere else; this page owns no booking logic of its own and
 * changes nothing under /b.
 */
const BOOKING_HREF = `/b/${SHOP_SLUG}`;

/**
 * The three services the shop leads with.
 *
 * THE RULE IS "ONE EVERYDAY STAPLE FROM EACH REAL CATEGORY", not "the most
 * expensive three". A barbershop's front page sells the visit someone makes
 * every few weeks, not its showpiece:
 *
 *   Haircut       (Haircuts)          the default cut, and the price every
 *                                     other number on the menu is read against
 *   Beard trim    (Shaving & beard)   the short, cheap, repeat grooming visit —
 *                                     the beard side without leading on the
 *                                     hot towel shave, which is an occasion
 *   Cut & beard   (Packages)          the standard combo, the one upsell a
 *                                     walk-in already recognises. One package,
 *                                     not both: "The full works" is the
 *                                     showpiece, not the staple.
 *
 * Deliberately not featured, all of them real: Skin fade and Buzz cut (both
 * duplicate the Haircuts slot), Line-up (a 15-minute add-on), Kids cut (a
 * segment, not the lead), Hot towel shave and The full works (premium).
 *
 * MATCHED BY ENGLISH NAME AGAINST LIVE ROWS, never transcribed. English
 * because this page is the shop's English copy (EXECUTION-PLAN.md, decision
 * 12): `nameEn` where the service has one, `name` where it doesn't.
 *
 * There is no `featured` flag on Service and this page doesn't add one, so the
 * *selection* has to live somewhere — but every name, price and duration a
 * visitor reads comes from the database, so an owner editing a price in the
 * dashboard cannot leave this page quoting a stale one. A renamed service drops
 * out of the trio rather than rendering text that is no longer true; see
 * pickFeatured.
 */
const FEATURED_SERVICE_NAMES = ["Haircut", "Beard trim", "Cut & beard"];

/**
 * Same cache() wrapper, and the same reason, as the booking page:
 * generateMetadata and the component both need the tenant, Next's request
 * deduplication only covers fetch(), and a Prisma call gets none of it. See the
 * note in (public)/b/[slug]/page.tsx for the measured detail.
 */
const getShop = cache(async (slug: string) => getTenantBySlug(slug));

export async function generateMetadata(): Promise<Metadata> {
  const tenant = await getShop(SHOP_SLUG);

  if (!tenant) return { title: "Shop not found" };

  // The shop's own name, with no product suffix. The root layout deliberately
  // sets no title.template, which is what keeps it that way.
  return {
    title: tenant.name,
    description: tenant.address
      ? `${tenant.name} — ${tenant.address}. Book an appointment online.`
      : `${tenant.name}. Book an appointment online.`,
  };
}

export default async function KastanienBarbershopPage() {
  // The public tenant-resolution path: resolved from a slug, server-side, never
  // from the session (CLAUDE.md rule 2). The slug is a constant here rather than
  // a route param, but it is still the URL's identity, not an authenticated one.
  const tenant = await getShop(SHOP_SLUG);
  if (!tenant) notFound();

  const [services, workingHours] = await Promise.all([
    getActiveServices(tenant.id),
    getWorkingHoursForActiveStaff(tenant.id),
  ]);

  const featured = pickFeatured(services);
  const menu = groupByCategory(services);
  // Public hours are the union of every active barber's WorkingHours — there is
  // no business-level hours field in this product, by design. mergeOpeningHours
  // always returns seven days, so Sunday (nobody rostered) renders "Closed"
  // rather than vanishing from the table.
  const openingHours = mergeOpeningHours(workingHours);

  const telHref = tenant.phone
    ? `tel:${tenant.phone.replace(/\s+/g, "")}`
    : null;

  // wa.me takes digits only — no plus, no spaces. \D strips both in one pass,
  // so "+49 711 4401278" becomes "497114401278". Built from the tenant's real
  // number, so this link genuinely reaches the shop.
  const whatsappHref = tenant.phone
    ? `https://wa.me/${tenant.phone.replace(/\D/g, "")}`
    : null;

  return (
    <div className="flex flex-1 flex-col bg-shop-ink text-shop-bone">
      {/* Fixed, transparent over the hero, solid past it — see SiteNav for why
          fixed rather than sticky, and why the border exists in both states.
          It replaces the floating Book now link entirely: the bar carries that
          CTA at every scroll position, so a second floating one would be the
          same button twice. */}
      <SiteNav
        shopName={tenant.name}
        phone={tenant.phone}
        telHref={telHref}
        bookingHref={BOOKING_HREF}
      />

      <main className="flex flex-1 flex-col">
        {/* The nav wordmark's scroll target. Deliberately the first thing in
            <main> and deliberately empty: the nav is `fixed` and so out of
            flow, which means this sits at y=0 and scrolling it into view lands
            at scrollTop 0 — above the hero, not merely at it.

            No scroll-mt here, unlike #services / #about / #visit. Those offset
            themselves so the fixed bar does not cover their headings; this one
            wants the true top of the document, and any margin would stop short
            of it.

            Zero-height by construction — an empty flex item in a `flex-col`
            parent has no main-axis size, and nothing here sets flex-grow. */}
        <div id="top" />

        {/* ---------------------------------------------------------------
            Hero — full-bleed photograph.

            svh rather than vh: on mobile Safari `vh` measures the viewport with
            the URL bar retracted, so a 100vh hero is taller than the screen it
            lands on and pushes its own CTA under the fold.

            TALLER ON PHONES (92svh) THAN ANYWHERE ELSE (85svh), and the reason
            is that `items-end` anchors the content to the *hero's* bottom edge,
            not the screen's. At 85svh on a 390x844 phone that left the block
            ending 191px above the fold — bottom-anchored by the CSS and
            floating mid-screen to the eye. 92svh closes that to 132px while
            still leaving 68px of the next section showing, which is the cue
            that there is more page below. Desktop keeps 85svh: there the block
            is wider, shorter, and the same gap reads as margin rather than
            drift.
            --------------------------------------------------------------- */}
        <section className="relative isolate flex min-h-[92svh] items-end sm:min-h-[85svh]">
          {/* `fill` rather than intrinsic dimensions: the section's height is a
              percentage of the viewport, which is not a number this file knows
              — and it is now two different percentages. The section's
              `relative` is what it fills.

              `priority` because this is the largest above-the-fold element and
              therefore the LCP candidate — lazy-loading it would delay the one
              paint the page is measured on. object-cover because the source is
              1376x768 and this box is nearly square on a phone: the crop has to
              come from somewhere. */}
          <Image
            src="/kastanien/hero.jpg"
            alt="Kastanien Barbershop interior"
            fill
            priority
            sizes="(min-width: 2816px) 2816px, 100vw"
            className="-z-10 object-cover"
          />
          {/* The scrim a real photograph would need too: headline text over an
              unknown image is unreadable without one. */}
          <div className="absolute inset-0 -z-10 bg-linear-to-t from-shop-ink via-shop-ink/80 to-shop-ink/40" />

          {/* ANCHORED LOWER-LEFT, and not by taste — measured. Sampling the
              photograph as object-cover actually crops it (1408x768 into
              1440x684: scaled 1.023x, 51px trimmed top and bottom) over a 6x4
              grid, the bottom-left cell is both the darkest and the flattest
              in the frame: mean 15.3/255, sd 12.6, against 35-71 with sd
              44-58 across the middle band where the mirror, the lamp and the
              chair are. It is the one region with nothing in it to compete
              with type. The block is capped at max-w-xl so it stays inside
              that quiet corner instead of running back under the bright
              mirror; pt is gone and pb is small, so it sits low rather than
              floating mid-frame. If the photograph is replaced, re-run that
              measurement — this position is a property of the picture. */}
          <div className="mx-auto w-full max-w-6xl px-6 pb-16 sm:pb-20">
            <div className="max-w-xl">
              {/* Replaces the "Barbershop" eyebrow: the same brass keyline the
                  section labels use, with no word attached. The business type
                  was never information a visitor needed — they are looking at
                  a photograph of a barbershop. */}
              <span
                aria-hidden="true"
                className="block h-px w-10 bg-shop-brass"
              />
              <h1 className="mt-8 font-hero text-5xl leading-[1.05] tracking-tight text-shop-bone sm:text-7xl">
                {tenant.name}
              </h1>

              {tenant.address ? (
                // bone/80 rather than shop-muted: measured against the actual
                // pixels under it, muted came out at 5.48:1 worst-case — the
                // weakest figure on the page, passing AA but only just, and
                // this line sits over a photograph rather than a flat fill.
                <p className="mt-6 text-lg text-shop-bone/80 sm:text-xl">
                  {tenant.address}
                </p>
              ) : null}

              <div className="mt-10 flex flex-wrap items-center gap-8">
                {/* One button, not two. A second outlined pill of equal weight
                    made the page ask twice and decide nothing; the menu is a
                    link because it goes down this same page, while Book now is
                    the only thing here that leaves for the booking flow. */}
                <Link
                  href={BOOKING_HREF}
                  className="inline-flex min-h-14 items-center rounded-xs bg-shop-brass px-10 text-base font-semibold text-shop-ink transition-colors hover:bg-shop-brass/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-shop-brass"
                >
                  Book now
                </Link>
                <a
                  href="#services"
                  className="inline-flex min-h-14 items-center text-base font-medium text-shop-bone underline decoration-shop-bone/40 underline-offset-8 transition-colors hover:decoration-shop-bone focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-shop-brass"
                >
                  See the menu
                </a>

                {telHref ? (
                  // Icon only, and the label carries the number: with no nav
                  // bar this is the only way to call from the first screen, and
                  // a third line of text here would flatten the hierarchy the
                  // single brass button exists to create.
                  //
                  // TWO POSITIONS, ONE ELEMENT. Below sm it is lifted out of
                  // this row and pinned to the hero's top-right corner; from sm
                  // up it is `static` again and sits inline beside the two
                  // controls, which is where it has always been. Measured
                  // reason: the row is `flex-wrap`, and at every width up to
                  // 414px the three controls do not fit on one line, so this
                  // link wrapped onto a second flex line of its own — an
                  // unlabelled glyph stranded under the button, adding 88px to
                  // the block for one 20px icon. Absolute takes it out of flow
                  // entirely, so the row is a single line on a phone.
                  //
                  // right-6/top-6 puts the edge of the ring on the px-6 gutter
                  // the rest of the page is set to. The ring is the thing you
                  // see, so it is what goes on the grid; aligning the glyph
                  // instead would leave the ring 6px from the screen edge.
                  //
                  // Outlined, not filled, so it reads as a button without
                  // competing with the one solid brass CTA. The ring is gold
                  // rather than brass, matched to the gilded mirror frame in
                  // the hero photograph, and the soft glow makes it look lit by
                  // the scene rather than pasted on top of it. It is the only
                  // box-shadow on the page, and it is a glow, not elevation. The
                  // /20 ink fill keeps the ring legible over light patches of
                  // the photograph.
                  //
                  // It stays last in DOM order, so on a phone the corner icon
                  // is tabbed to after Book now rather than before it. That is
                  // the right trade: DOM order can only match one breakpoint's
                  // visual order, and the CTA should be the first stop either
                  // way.
                  //
                  // The containing block is the <section>, which is `relative`
                  // — nothing between here and it is positioned. It sits above
                  // the photograph and scrim (both -z-10) on z-auto.
                  //
                  // size-14 is a 56px tap target in both positions —
                  // an icon link that is merely icon-sized is a 20px target on
                  // the device most likely to dial it.
                  //
                  // Inline SVG rather than an icon package: there is no icon
                  // dependency in this project and adding one needs approval
                  // (CLAUDE.md rule 4). Same shape as the tick in
                  // (public)/b/[slug]/booked/[token]/page.tsx — no fill, stroke
                  // currentColor, sized with size-*.
                  <a
                    href={telHref}
                    aria-label={`Call ${tenant.phone}`}
                    className="absolute right-6 top-6 inline-flex size-14 items-center justify-center rounded-full border border-[#c9a227] bg-shop-ink/20 shadow-[0_0_12px_rgba(201,162,39,0.4)] text-shop-brass transition-colors hover:border-shop-bone hover:text-shop-bone focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-shop-brass sm:static"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="size-5"
                      aria-hidden="true"
                    >
                      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92Z" />
                    </svg>
                  </a>
                ) : null}
              </div>
            </div>
          </div>

          {/* Ornament: the address set vertically down the left edge.
              Decorative repetition, not information — the hero already states
              the address in the content block, so this is aria-hidden and a
              screen reader hears it once, not twice.

              GATED AT xl, and the arithmetic is the reason. It sits at left-6,
              i.e. x=24, while the content column starts wherever max-w-6xl
              (1152px) lands: at xl (1280) that is x=88, leaving a clear 64px
              gutter. At lg (1024) the container is narrower than its max, the
              content starts at x=24, and the two would occupy the same
              pixels. Below xl it simply isn't rendered. */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-6 top-1/2 hidden -translate-y-1/2 text-[0.625rem] uppercase tracking-[0.35em] text-shop-muted [writing-mode:vertical-rl] xl:block"
          >
            {tenant.address}
          </span>

          {/* The marker SiteNav observes. Anchored to the hero's own
              bottom edge rather than to a duplicated 85svh literal, so it stays
              correct if the hero's height ever changes. Zero-height and
              non-interactive: it is a position, not an element anyone sees. */}
          <div
            id={HERO_SENTINEL_ID}
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-px"
          />
        </section>

        {/* ---------------------------------------------------------------
            About — the one block on this page whose prose is hand-written
            rather than read from the database. See the exception recorded in
            the file header.
            --------------------------------------------------------------- */}
        <section
          id="about"
          className="mx-auto w-full max-w-6xl scroll-mt-24 px-6 py-24 sm:py-32"
        >
          <div className="grid gap-12 lg:grid-cols-[1.1fr_0.9fr] lg:gap-20">
            <div>
              <SectionLabel>About</SectionLabel>
              <h2 className="mt-5 font-display text-4xl leading-tight tracking-tight text-shop-bone sm:text-5xl">
                About the shop
              </h2>

              {/* The shop's approved copy, set as a pull-quote. A plain div
                  rather than figure/figcaption now that the label is gone —
                  a figure with no caption earns nothing, and blockquote would
                  claim this is quoted from somewhere, which it isn't. The
                  brass mark is decoration, hence aria-hidden: a screen reader
                  should get the sentence, not a stray punctuation glyph. */}
              <div className="mt-10 flex gap-5 sm:gap-8">
                <span
                  aria-hidden="true"
                  className="-mt-4 select-none font-display text-7xl leading-none text-shop-brass sm:text-8xl"
                >
                  &ldquo;
                </span>
                <p className="font-display text-2xl italic leading-relaxed text-shop-bone sm:text-3xl">
                  Craft, Precision, and Time. Kastanien wasn&rsquo;t built to
                  scale — it was built to last. Tucked away in Stuttgart, our
                  space operates on a simple principle: classic barbering
                  executed with exacting standards. We don&rsquo;t rush
                  services, run assembly lines, or follow fleeting trends. Every
                  cut, shave, and detail is tailored to the individual, using
                  traditional techniques refined for modern life. Take a seat,
                  enjoy a proper espresso, and leave with a clean line.
                </p>
              </div>
            </div>

            {/* Intrinsic dimensions rather than `fill`, so no positioned
                wrapper is needed. The file is 848x1264 (0.67) and the box is
                4/5 (0.80), so object-cover crops roughly 16% off the height —
                deliberate: this is an atmosphere shot, not a posed subject.
                Lazy by default; it is well below the fold.

                DELIBERATELY WIDER THAN ITS COLUMN from lg up. Two columns of
                identical width with a picture politely inside one of them is
                the shape every template produces; letting the photograph run
                past its own edge is what makes the spread look composed rather
                than filled in. `w-[calc(100%+4rem)]` overhangs by 4rem and
                `-mr-16` pulls that overhang outward into the page gutter
                instead of shoving the text column left, so the type below is
                unmoved.

                GATED AT xl, NOT lg, AND THE ARITHMETIC IS THE REASON. The page
                is max-w-6xl (1152px) with px-6, so the gutter the overhang
                spills into is (viewport - 1152) / 2 + 24. At the lg breakpoint
                that is 24px against a 64px overhang — 40px of horizontal page
                scroll, on every viewport from 1024 to ~1232. At xl (1280) the
                gutter is 88px and the bleed fits with room to spare. Below xl
                the image stays inside its column. */}
            <Image
              src="/kastanien/interior.jpg"
              alt="Inside Kastanien Barbershop"
              width={848}
              height={1264}
              sizes="(min-width: 1024px) 45vw, 100vw"
              className="aspect-4/5 w-full rounded-xs object-cover xl:-mr-16 xl:w-[calc(100%+4rem)] xl:max-w-none"
            />
          </div>
        </section>

        {/* ---------------------------------------------------------------
            Services — the one section built entirely from real rows.
            --------------------------------------------------------------- */}
        <section
          id="services"
          className="scroll-mt-24 border-t border-shop-leather/60 bg-shop-ink"
        >
          <div className="mx-auto w-full max-w-6xl px-6 py-24 sm:py-32">
            <SectionLabel>Services</SectionLabel>
            <h2 className="mt-5 max-w-2xl font-display text-4xl leading-tight tracking-tight text-shop-bone sm:text-5xl">
              Signature services
            </h2>

            {featured.length > 0 ? (
              /* Hairline outline, no fill. A box that only draws its edge
                 reads as a frame around the type; the moment it takes a
                 background it becomes a card, which is the thing this page
                 keeps trying not to look like.

                 Written as a bare block comment rather than the brace-wrapped
                 JSX form used elsewhere in this file: this position is a
                 ternary branch, i.e. an expression, where braces would parse
                 as an object literal instead of a JSX child. */
              <ul className="mt-14 grid gap-6 sm:grid-cols-3">
                {featured.map((service) => (
                  /* Double-rule frame, engraved-plate style. Two nested
                     elements rather than a box-shadow ring: faking the inner
                     line needs an opaque spacer shadow in the card's own
                     background colour, and these cards have no background —
                     the page ink shows through. That trick would hardcode
                     shop-ink into the card and break silently the day the card
                     or the section takes a fill. One div is cheaper than that
                     coupling.

                     p-1.5 (6px) is the channel between the rules; the inner
                     element carries the content padding, so the 32px gutter is
                     measured from the inner line and nothing crowds it. */
                  <li
                    key={service.id}
                    className="border border-shop-bone/15 p-1.5"
                  >
                    {/* h-full so the inner rule reaches the bottom of a card
                        the grid has stretched to its row's height — without it
                        the frame floats short on any card with less content
                        than its neighbours. */}
                    <div className="flex h-full flex-col justify-between gap-12 border border-shop-bone/15 p-8">
                      <div>
                        {/* TYPOGRAPHY ONLY. Several icon concepts were tried
                            above this name — numerals, a razor, clippers, an
                            ampersand, a paired mark — and each either failed to
                            resolve at the size or said less than the name did.
                            The frame and the type carry the card.

                            No description line either: Service has no
                            description column, and one written here would be
                            invented copy.

                            No mt- on this heading: the name is the card's first
                            element now, so its distance from the inner rule is
                            the frame's own p-8. The mt-5 it used to carry was
                            the channel under the mark; keeping it would leave a
                            52px void against 32px on the other three sides,
                            reading as a missing element rather than as
                            breathing room. */}
                        <h3 className="font-display text-3xl leading-tight text-shop-bone">
                          {serviceName(service, "en")}
                        </h3>
                        <p className="mt-3 text-sm text-shop-muted">
                          {formatDuration(service.durationMinutes, "en")}
                        </p>
                      </div>
                      {/* Same type size as the name, so the price reads as
                          half of the offer rather than a footnote to it. */}
                      <p className="font-display text-3xl tabular-nums text-shop-bone">
                        {formatPrice(service.priceMinorUnits)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : null}

            <div className="mt-10">
              <a
                href="#menu"
                className="inline-flex min-h-11 items-center gap-2 text-base font-medium text-shop-brass underline-offset-4 transition-colors hover:text-shop-bone hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-shop-brass"
              >
                View all services
                <span aria-hidden="true">&darr;</span>
              </a>
            </div>

            {/* The complete menu, which is where "View all services" lands — so
                it lists every active service, the featured three included. */}
            <div id="menu" className="mt-24 scroll-mt-24 sm:mt-32">
              <h3 className="font-display text-3xl leading-tight tracking-tight text-shop-bone sm:text-4xl">
                The full menu
              </h3>

              {menu.length === 0 ? (
                <p className="mt-8 text-lg text-shop-muted">
                  No services listed yet.
                </p>
              ) : (
                <div className="mt-12 grid gap-x-16 gap-y-14 sm:grid-cols-2">
                  {menu.map((group) => (
                    <div key={group.category ?? "__uncategorized"}>
                      <h4 className="text-xs font-semibold uppercase tracking-[0.25em] text-shop-brass">
                        {categoryLabel(
                          {
                            category: group.category,
                            categoryEn: groupCategoryEn(group.services),
                          },
                          "en",
                        ) ?? "Other"}
                      </h4>
                      <ul className="mt-6 flex flex-col gap-5">
                        {group.services.map((service) => (
                          <li
                            key={service.id}
                            className="flex items-baseline justify-between gap-6 border-b border-shop-leather/60 pb-5"
                          >
                            {/* min-w-0 is what lets a long name truncate
                                instead of shoving the price off a narrow
                                screen — same reason as the booking page's
                                service rows. */}
                            <div className="min-w-0">
                              <p className="truncate text-lg text-shop-bone">
                                {serviceName(service, "en")}
                              </p>
                              <p className="mt-1 text-sm text-shop-muted">
                                {formatDuration(service.durationMinutes, "en")}
                              </p>
                            </div>
                            <span className="shrink-0 tabular-nums text-shop-bone">
                              {formatPrice(service.priceMinorUnits)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------------
            Visit — address, phone, and the merged opening hours.
            --------------------------------------------------------------- */}
        <section
          id="visit"
          className="scroll-mt-24 border-t border-shop-leather/60"
        >
          <div className="mx-auto w-full max-w-6xl px-6 py-24 sm:py-32">
            <div className="grid gap-14 lg:grid-cols-2 lg:gap-20">
              <div>
                <SectionLabel>Visit</SectionLabel>
                <h2 className="mt-5 font-display text-4xl leading-tight tracking-tight text-shop-bone sm:text-5xl">
                  Find us
                </h2>

                {tenant.address ? (
                  <p className="mt-8 text-xl leading-relaxed text-shop-bone">
                    {tenant.address}
                  </p>
                ) : null}

                {telHref ? (
                  <a
                    href={telHref}
                    className="mt-4 inline-flex min-h-11 items-center text-lg text-shop-muted underline-offset-4 transition-colors hover:text-shop-bone hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-shop-brass"
                  >
                    {tenant.phone}
                  </a>
                ) : null}
              </div>

              <div>
                <h3 className="text-xs font-semibold uppercase tracking-[0.25em] text-shop-brass">
                  Opening hours
                </h3>
                <OpeningHoursTable days={openingHours} />
              </div>
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------------
            The closing CTA — the one place brass covers a whole surface.
            --------------------------------------------------------------- */}
        <section className="bg-shop-brass text-shop-ink">
          <div className="mx-auto flex w-full max-w-6xl flex-col items-start gap-10 px-6 py-24 sm:py-28 lg:flex-row lg:items-center lg:justify-between">
            <h2 className="max-w-xl font-display text-4xl leading-tight tracking-tight sm:text-5xl">
              Book your next appointment
            </h2>
            <Link
              href={BOOKING_HREF}
              className="inline-flex min-h-14 shrink-0 items-center rounded-xs bg-shop-ink px-10 text-base font-semibold text-shop-bone transition-colors hover:bg-shop-walnut focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-shop-ink"
            >
              Book now
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-shop-leather/60">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-6 py-14 sm:flex-row sm:items-center sm:justify-between">
          <span className="font-display text-lg text-shop-bone">
            {tenant.name}
          </span>

          {/* Sits between the wordmark and the contact block, which is where
              sm:justify-between leaves a gap on wide screens. */}
          <div className="flex items-center gap-1">
            {whatsappHref ? (
              <SocialLink href={whatsappHref} label="Chat on WhatsApp">
                <path d="M20.6 11.7a8.5 8.5 0 0 1-12.6 7.5L3.4 20.6l1.4-4.6A8.5 8.5 0 1 1 20.6 11.7Z" />
                <path d="M9.3 8.6h1.5l1 2.4-1.2.9a5.8 5.8 0 0 0 2.6 2.6l.9-1.2 2.4 1v1.5a6.1 6.1 0 0 1-7.2-7.2Z" />
              </SocialLink>
            ) : null}
            {/* The label names the destination, not a shop account: these two
                go to the platforms' own homepages because this tenant has no
                profile to link. "Instagram" alone would tell a screen-reader
                user they are opening the shop's Instagram, which is not true. */}
            <SocialLink
              href="https://www.instagram.com"
              label="Instagram (opens instagram.com)"
            >
              <rect x="3" y="3" width="18" height="18" rx="5" />
              <circle cx="12" cy="12" r="4" />
              <circle cx="17.2" cy="6.8" r="1" />
            </SocialLink>
            <SocialLink
              href="https://www.facebook.com"
              label="Facebook (opens facebook.com)"
            >
              <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
            </SocialLink>
          </div>
          <div className="flex flex-col gap-1 text-sm text-shop-muted sm:items-end">
            {tenant.address ? <span>{tenant.address}</span> : null}
            {telHref ? (
              <a
                href={telHref}
                className="inline-flex min-h-11 items-center underline-offset-4 transition-colors hover:text-shop-bone hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-shop-brass sm:min-h-0"
              >
                {tenant.phone}
              </a>
            ) : null}
          </div>
        </div>
      </footer>

      {/* Last child, so it lies over every other layer on the page. */}
      <GrainOverlay />
    </div>
  );
}

/**
 * One external social link: a 28px line mark inside a 44px touch target.
 *
 * target="_blank" with rel="noopener noreferrer" — the first stops the opened
 * page reaching back through window.opener, the second withholds the referrer.
 * These are the only outbound links on the page.
 *
 * Inline SVG, since CLAUDE.md rule 4 leaves no room for an icon dependency.
 * 1.5px round/round, matching the hero's dial glyph — the page's only icon
 * convention now that the service-card marks are gone. The earlier
 * 1px/butt/miter here belonged to those deleted marks and left two icon
 * languages on one page; this is the unification.
 */
function SocialLink({
  href,
  label,
  children,
}: {
  href: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      className="inline-flex min-h-11 min-w-11 items-center justify-center text-shop-brass transition-colors hover:text-shop-bone focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-shop-brass"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-7"
        aria-hidden="true"
      >
        {children}
      </svg>
    </a>
  );
}

/** The short brass rule and label that opens each section. */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.3em] text-shop-brass">
      <span aria-hidden="true" className="h-px w-8 bg-shop-brass" />
      {children}
    </p>
  );
}

/**
 * The seven-day table.
 *
 * Same helpers as components/booking/opening-hours.tsx — WEEKDAY_LABELS and
 * formatMinuteOfDay — but not that component: it is styled in the booking
 * page's zinc, and pushing this page's palette through it would put marketing
 * concerns into a component the transactional pages depend on. The part worth
 * sharing is the weekday arithmetic, and that already lives in
 * mergeOpeningHours.
 */
function OpeningHoursTable({ days }: { days: DayOpeningHours[] }) {
  return (
    <dl className="mt-6 flex flex-col">
      {days.map((day) => (
        <div
          key={day.dayOfWeek}
          className="flex items-baseline justify-between gap-6 border-b border-shop-leather/60 py-4"
        >
          <dt className="text-lg text-shop-muted">
            {WEEKDAY_LABELS[day.dayOfWeek]}
          </dt>
          <dd className="text-right text-lg tabular-nums text-shop-bone">
            {day.intervals.length === 0 ? (
              <span className="text-shop-muted/70">Closed</span>
            ) : (
              day.intervals
                .map(
                  (interval) =>
                    `${formatMinuteOfDay(interval.startMinute)} – ${formatMinuteOfDay(interval.endMinute)}`,
                )
                .join(", ")
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * The featured trio, resolved against live rows in the order listed above.
 *
 * A name that no longer matches is dropped rather than rendered from the
 * constant — the page would sooner show two cards than quote a service that
 * isn't in the database.
 */
function pickFeatured(services: PublicService[]): PublicService[] {
  return FEATURED_SERVICE_NAMES.map((name) =>
    services.find((service) => serviceName(service, "en") === name),
  ).filter((service): service is PublicService => service !== undefined);
}
