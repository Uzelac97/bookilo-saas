"use client";

import { useState, useTransition } from "react";

import { setLocaleAction, setThemeAction } from "@/app/preferences-actions";
import { useLocale, useT } from "@/lib/i18n/client";
import type { MessageKey } from "@/lib/i18n/translate";
import { LOCALES, THEMES, type Locale, type Theme } from "@/lib/preferences";

/**
 * Language and theme switches, shown in the dashboard header and on the login
 * page — owner-facing surfaces only. A customer on /b/[slug] gets the defaults
 * (German, their OS theme) and no switch.
 */
export function PreferenceToggles({ theme }: { theme: Theme }) {
  return (
    <div className="flex items-center gap-2">
      <LocaleToggle />
      <ThemeToggle initialTheme={theme} />
    </div>
  );
}

// Module-private: `"use client"` turns exports into client references, so
// these stay unexported (CLAUDE.md).
const THEME_LABELS: Record<Theme, MessageKey> = {
  system: "preferences.themeSystem",
  light: "preferences.themeLight",
  dark: "preferences.themeDark",
};

function ThemeToggle({ initialTheme }: { initialTheme: Theme }) {
  const t = useT();
  const [theme, setTheme] = useState(initialTheme);
  const [, startTransition] = useTransition();

  function choose(next: Theme) {
    setTheme(next);

    // Applied to <html> immediately rather than waiting for the server
    // round trip, so the switch is instant. The server re-renders the same
    // attribute from the cookie once the action lands, so the two agree.
    // setAttribute rather than `dataset.theme =`: the React Compiler lint
    // treats property assignment on a global as a render-time mutation, and
    // this runs in an event handler, where a DOM write is exactly right.
    const root = document.documentElement;
    if (next === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", next);

    startTransition(() => setThemeAction(next));
  }

  return (
    <Segmented label={t("preferences.theme")}>
      {THEMES.map((option) => (
        <SegmentButton
          key={option}
          selected={option === theme}
          label={t(THEME_LABELS[option])}
          onClick={() => choose(option)}
        >
          <ThemeIcon theme={option} />
        </SegmentButton>
      ))}
    </Segmented>
  );
}

function LocaleToggle() {
  const t = useT();
  const locale = useLocale();
  const [pending, startTransition] = useTransition();

  function choose(next: Locale) {
    if (next === locale) return;
    // The cookie write re-renders the route on the server, which is what
    // swaps every string — there is no client-side dictionary switch to make.
    startTransition(() => setLocaleAction(next));
  }

  return (
    <Segmented label={t("preferences.language")} pending={pending}>
      {LOCALES.map((option) => (
        <SegmentButton
          key={option}
          selected={option === locale}
          label={option === "de" ? "Deutsch" : "English"}
          lang={option}
          onClick={() => choose(option)}
        >
          <span className="px-0.5 text-xs font-semibold uppercase">{option}</span>
        </SegmentButton>
      ))}
    </Segmented>
  );
}

function Segmented({
  label,
  pending = false,
  children,
}: {
  label: string;
  pending?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      aria-busy={pending || undefined}
      className={[
        "inline-flex rounded-lg border border-line-strong bg-surface p-0.5 transition-opacity",
        pending ? "opacity-60" : "opacity-100",
      ].join(" ")}
    >
      {children}
    </div>
  );
}

function SegmentButton({
  selected,
  label,
  lang,
  onClick,
  children,
}: {
  selected: boolean;
  label: string;
  lang?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={label}
      title={label}
      lang={lang}
      onClick={onClick}
      className={[
        "inline-flex size-8 items-center justify-center rounded-md transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
        selected
          ? "bg-primary text-on-primary"
          : "text-fg-muted hover:bg-subtle hover:text-fg",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

/** Monitor, sun, moon — drawn inline rather than pulled from an icon package. */
function ThemeIcon({ theme }: { theme: Theme }) {
  const common = {
    width: 16,
    height: 16,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  if (theme === "light") {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
      </svg>
    );
  }

  if (theme === "dark") {
    return (
      <svg {...common}>
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </svg>
  );
}
