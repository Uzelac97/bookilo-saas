/**
 * The id linking the hero's bottom-edge marker to the floating Book now link
 * that watches it.
 *
 * IN ITS OWN PLAIN MODULE, not in the "use client" file that uses it. CLAUDE.md
 * forbids exporting a constant from a client module: the directive rewrites
 * every export into a client reference, so the server component importing this
 * would receive a throwing proxy rather than a string — and nothing would type
 * error to warn anyone. A file with no directive is importable from both sides.
 */
export const HERO_SENTINEL_ID = "hero-end";
