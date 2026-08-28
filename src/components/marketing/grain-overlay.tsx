/**
 * A film-grain wash over the whole viewport.
 *
 * The noise is an inline SVG feTurbulence baked into a data URI rather than a
 * PNG in public/: it is a few hundred bytes of markup, it scales to any DPR
 * without a second asset, and it adds no network request. `fractalNoise` with
 * four octaves gives the irregular, photographic grain this palette wants;
 * `stitchTiles` keeps the 160px tile from showing seams where it repeats.
 *
 * FIXED, NOT ABSOLUTE, so the grain sits still while the page scrolls
 * underneath — grain that scrolls with the content reads as a texture printed
 * on the page, which is the opposite of the intent.
 *
 * mix-blend-mode: overlay lets the ink and the photographs show through and
 * modulates them, instead of laying a flat grey veil on top. pointer-events
 * off and aria-hidden, because it is decoration covering every interactive
 * element on the page — without the former nothing on the page is clickable.
 *
 * z-40 puts it over the nav (z-30) deliberately: the grain is a lens over the
 * finished page, and a nav that sat above it would look like a different
 * material from everything else.
 */
const NOISE = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`;

export function GrainOverlay() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-40 opacity-10 mix-blend-overlay"
      style={{ backgroundImage: NOISE }}
    />
  );
}
