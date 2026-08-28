"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { HERO_SENTINEL_ID } from "./hero-sentinel";

/**
 * The section anchors. Hash targets are string-coupled to the ids in the page
 * by nature; the ids live as literals there, the same way the hero's own
 * "See the menu" link already points at "#services".
 */
const NAV_LINKS = [
  { href: "#services", label: "Services" },
  { href: "#about", label: "About" },
  { href: "#visit", label: "Visit" },
];

/**
 * The marketing page's navigation: absent over the hero, present past it.
 *
 * HIDDEN ENTIRELY WHILE THE HERO IS ON SCREEN, not merely transparent. The hero
 * already states the shop's name and offers Book now; a transparent bar
 * carrying the same two things sat in the same viewport saying them twice. The
 * bar earns its place only once the hero's own content has scrolled away.
 *
 * A CONSEQUENCE WORTH KNOWING: this is now purely an enhancement. It starts
 * hidden, so if hydration never happens there is no bar at all — where the
 * earlier transparent version would still have been usable. The page survives
 * that: the hero carries Book now, the menu link and the phone, and the closing
 * band repeats the CTA. Nothing here is the only route to anything.
 *
 * FIXED RATHER THAN STICKY, deliberately, and this is the one detail that has
 * bitten this page before. `sticky` participates in normal flow, so a sticky
 * bar would sit *above* the hero and push it down — which is exactly the "gap
 * between the header and the photo" symptom reported earlier in this page's
 * life. The bar has to overlay the photograph, which means staying out of
 * flow. `fixed` pins without occupying space.
 *
 * VISIBILITY IS DRIVEN BY AN IntersectionObserver on a 1px marker at the hero's
 * bottom edge, not a scroll handler. It fires twice for the whole page — once
 * when the hero leaves, once if it comes back — where a scroll listener would
 * run on every frame for a boolean that changes twice.
 *
 * Only opacity is transitioned. The background and border change at the same
 * instant as the fade, and a fade that begins at opacity-0 hides the colour
 * swap completely, so there is nothing else worth animating. No shadow, in
 * either state: nothing on this page uses shadow-based elevation.
 */
export function SiteNav({
  shopName,
  phone,
  telHref,
  bookingHref,
}: {
  shopName: string;
  phone: string | null;
  telHref: string | null;
  bookingHref: string;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const sentinel = document.getElementById(HERO_SENTINEL_ID);
    if (!sentinel) return;

    const observer = new IntersectionObserver((entries) => {
      const entry = entries[0];
      if (entry) setVisible(!entry.isIntersecting);
    });

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  return (
    <header
      // inert, not just pointer-events-none: opacity-0 leaves links focusable,
      // so a keyboard user tabbing out of the hero would land on an invisible
      // bar. inert takes the whole subtree out of the tab order and the
      // accessibility tree at once, which is exactly the intent, and React 19
      // accepts it as a real boolean prop. Browsers without inert fall back to
      // focusable-but-invisible — no worse than not having written it.
      inert={!visible}
      className={`fixed inset-x-0 top-0 z-30 border-b transition-opacity duration-300 ${
        visible
          ? "border-shop-brass/20 bg-shop-ink opacity-100"
          : "pointer-events-none border-transparent opacity-0"
      }`}
    >
      <nav
        aria-label="Primary"
        className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-6 py-5 md:gap-6"
      >
        {/* A signature, not a headline: text-lg against the hero's text-7xl.

            IT IS A LINK, AND IT GOES UP, NOT AWAY. A wordmark normally points
            at the site root; here the site root *is* this page, so it points at
            "#top" — an empty anchor sitting above the hero in page.tsx. The bar
            only exists once the hero has scrolled off, so "back to the top" is
            the one thing the wordmark can usefully do at every moment it is on
            screen.

            NO JS. The scroll is animated entirely by `scroll-behavior: smooth`
            on the scrolling element, which globals.css already scopes to this
            route group and — importantly — wraps in a
            prefers-reduced-motion: no-preference query. So this link inherits
            the same motion contract as "See the menu" and the three anchors
            beside it, including the instant jump for anyone who has asked for
            reduced motion. A scrollTo({behavior:"smooth"}) handler would have
            had to reimplement that check by hand.

            aria-label rather than the bare name: as a link, "Kastanien
            Barbershop" alone does not say where it goes. The visible text is
            still the first thing in the accessible name, which is what WCAG
            2.5.3 (Label in Name) requires, so voice control still activates it
            by the words on screen.

            min-w-0 + truncate is a backstop, not a fix for a known bug. At 390px
            this row measures 24..180 for the wordmark and 234..366 for the
            controls — the content edge exactly, with room to spare — and it
            measured the same before these classes existed. They earn their place
            only against a longer shop name than this one: the wordmark
            ellipsises rather than pushing the CTA off the screen, because
            shrink-0 on the controls means the wordmark is what gives way.

            truncate keeps working now that this is an <a>: it needs a block box,
            and a flex item is blockified whatever its own display was. */}
        <a
          href="#top"
          aria-label={`${shopName} — back to top`}
          className="min-w-0 truncate font-hero text-base tracking-tight text-shop-bone transition-colors hover:text-shop-brass focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-shop-brass sm:text-lg"
        >
          {shopName}
        </a>

        {/* Hidden below md rather than collapsed into a hamburger. Three
            anchors to three sections of one page do not earn a disclosure
            widget, and on a phone the wordmark, a dial button and Book now are
            the whole job. */}
        <div className="hidden items-center gap-8 md:flex">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-xs uppercase tracking-[0.15em] text-shop-bone/70 transition-colors hover:text-shop-brass focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-shop-brass"
            >
              {link.label}
            </a>
          ))}
        </div>

        {/* shrink-0: the wordmark gives way, never the dial button or the CTA. */}
        <div className="flex shrink-0 items-center gap-3 sm:gap-5">
          {telHref ? (
            // The number on wide screens, the glyph on narrow ones — one
            // element, so there is only ever one dial target in the tab order.
            // aria-label carries the number either way, so the icon-only form
            // is not an unlabelled control. min-h-11 is the 44px touch target
            // the booking page uses for the same link.
            <a
              href={telHref}
              aria-label={`Call ${phone}`}
              className="inline-flex min-h-11 items-center text-sm text-shop-bone/70 transition-colors hover:text-shop-brass focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-shop-brass"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="size-4 md:hidden"
                aria-hidden="true"
              >
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92Z" />
              </svg>
              <span className="hidden md:inline">{phone}</span>
            </a>
          ) : null}

          {/* The only filled element in the bar, so it reads as the one thing
              to do rather than a fourth link. */}
          <Link
            href={bookingHref}
            className="inline-flex min-h-11 items-center rounded-xs bg-shop-brass px-5 text-sm font-semibold text-shop-ink transition-colors hover:bg-shop-brass/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-shop-brass"
          >
            Book now
          </Link>
        </div>
      </nav>
    </header>
  );
}
