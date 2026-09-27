import { Abril_Fatface, Fraunces } from "next/font/google";

/**
 * The brand face, used at exactly two sizes on the whole page: the hero's h1
 * and the nav wordmark. Nothing else — headings, eyebrows and service names
 * all stay on Fraunces below, which is the point of having two faces rather
 * than one loud one.
 *
 * WEIGHT 400 IS THE ONLY WEIGHT ABRIL FATFACE HAS. Asking for 700 or 900 does
 * not error; next/font would fail the build, but a stray `font-bold` in the
 * markup would silently synthesise a faux-bold instead. There is no bold to
 * reach for, so don't.
 */
const abril = Abril_Fatface({
  variable: "--font-abril",
  subsets: ["latin"],
  weight: ["400"],
  display: "swap",
});

/**
 * The display face, loaded for this route group only.
 *
 * Fraunces against the app's existing Geist is the "craft vs. trustworthy
 * business" contrast the marketing page is after: a serif with actual weight
 * for the shop's name and headings, the same clean sans as the rest of the
 * product for everything a customer has to read.
 *
 * SCOPED HERE RATHER THAN IN THE ROOT LAYOUT on purpose. The dashboard and the
 * booking flow have no use for a display serif, and a font declared in
 * app/layout.tsx is downloaded on every route that layout wraps — which is all
 * of them. next/font emits a <link rel=preload> per route the font is used on,
 * so keeping the call in this segment keeps the cost on this segment.
 *
 * No `weight`: Fraunces is a variable font, so omitting it gives the whole
 * 100–900 axis in one file rather than pinning two static cuts.
 *
 * This adds nothing to package.json — next/font ships inside `next` — so
 * CLAUDE.md rule 4 (ask before adding a dependency) doesn't apply.
 */
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  // The About pull-quote is set in italic. Without this, next/font loads only
  // the roman and the browser synthesises an oblique by shearing the glyphs —
  // visible and ugly at 30px display size, which is exactly the "generic" tell
  // this page is trying not to have.
  style: ["normal", "italic"],
  display: "swap",
});

export default function MarketingLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // flex-1 so the page fills the flex column the root layout puts on <body>;
  // without it a short page leaves the footer floating mid-viewport.
  //
  // data-marketing is the hook globals.css matches on to enable smooth anchor
  // scrolling for this route group only — scroll-behavior has to live on the
  // scrolling element (html), so it cannot be scoped by nesting.
  //
  // lang="en" because this page's copy is the shop's own, written in English,
  // and is not translated with the app's interface language. <html lang> now
  // follows that language (German by default), so without this a screen
  // reader would read English copy with German pronunciation.
  return (
    <div
      lang="en"
      data-marketing
      className={`${fraunces.variable} ${abril.variable} flex flex-1 flex-col`}
    >
      {children}
    </div>
  );
}
