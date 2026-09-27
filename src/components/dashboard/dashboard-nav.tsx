"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useT } from "@/lib/i18n/client";
import type { MessageKey } from "@/lib/i18n/translate";

/**
 * MODULE-PRIVATE ON PURPOSE — do not export.
 *
 * `"use client"` rewrites every export in this file into a client reference, so
 * exporting this array would hand a server component a throwing proxy instead of
 * a list, with no type error to warn you. That exact bug has already been fixed
 * twice in this repo (`ANY_STAFF`, and a useActionState initial-state constant),
 * and a nav config is precisely the kind of thing someone exports later "just to
 * reuse the labels". If a server component ever needs these, they move to a
 * plain module — they do not get an `export` here.
 */
const NAV_ITEMS: { href: string; label: MessageKey }[] = [
  { href: "/dashboard", label: "nav.today" },
  { href: "/dashboard/calendar", label: "nav.calendar" },
  { href: "/dashboard/services", label: "nav.services" },
  { href: "/dashboard/staff", label: "nav.staff" },
  { href: "/dashboard/settings", label: "nav.settings" },
];

/**
 * The dashboard's primary navigation.
 *
 * A client component only because the active item needs usePathname(). Scrolls
 * horizontally rather than wrapping on a narrow screen — an owner checking the
 * day on their phone should not lose a row of content to nav that has reflowed
 * onto two lines.
 */
export function DashboardNav() {
  const pathname = usePathname();
  const t = useT();

  return (
    <nav
      aria-label={t("nav.label")}
      // Same overflow treatment as the public date strip, and scrollbar-hide
      // (app/globals.css) for the same reason: a native bar under five nav items
      // reads as a rendering fault, not as a control. Only ever overflows on a
      // narrow screen, where swiping is the expected gesture.
      className="-mx-4 overflow-x-auto px-4 scrollbar-hide sm:mx-0 sm:px-0"
    >
      <ul className="flex min-w-max gap-1">
        {NAV_ITEMS.map((item) => {
          // Exact match, not startsWith: "/dashboard" is a prefix of every other
          // href, so a prefix test would light up Today on every screen.
          const active = pathname === item.href;

          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={[
                  "block rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary text-on-primary"
                    : "text-fg-tertiary hover:bg-subtle hover:text-fg",
                ].join(" ")}
              >
                {t(item.label)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
