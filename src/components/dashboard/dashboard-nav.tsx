"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

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
const NAV_ITEMS = [
  { href: "/dashboard", label: "Today" },
  { href: "/dashboard/calendar", label: "Calendar" },
  { href: "/dashboard/services", label: "Services" },
  { href: "/dashboard/staff", label: "Staff" },
  { href: "/dashboard/settings", label: "Settings" },
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

  return (
    <nav
      aria-label="Dashboard"
      className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0"
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
                    ? "bg-zinc-900 text-white"
                    : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900",
                ].join(" ")}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
