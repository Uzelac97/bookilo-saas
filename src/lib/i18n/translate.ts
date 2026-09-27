/**
 * The translation function, and the only code that knows how messages are
 * stored.
 *
 * Hand-rolled rather than next-intl: two locales, no routing, no ICU syntax
 * beyond one plural — a dependency would buy nothing this file doesn't do in
 * forty lines (CLAUDE.md rule 5).
 *
 * Pure and directive-free, so it runs in server components, client components,
 * email templates and tests alike.
 */
import type { Locale } from "@/lib/preferences";
import type { Vertical } from "@/lib/vertical";

import { de } from "./messages/de";
import { en } from "./messages/en";
import { salonDe } from "./messages/salon.de";
import { salonEn } from "./messages/salon.en";

export type MessageKey = keyof typeof de;

/**
 * A plural message is stored as two keys, `<base>.one` and `<base>.other`,
 * and called by its base with a `count`. German and English both have exactly
 * these two categories, so nothing wider is needed.
 */
export type PluralKey = {
  [K in MessageKey]: K extends `${infer Base}.one` ? Base : never;
}[MessageKey];

export type MessageParams = Record<string, string | number>;

export type Translator = (key: MessageKey | PluralKey, params?: MessageParams) => string;

const DICTIONARIES: Record<Locale, Record<MessageKey, string>> = { de, en };

type Overlay = Partial<Record<MessageKey, string>>;

/**
 * The terminology map: per vertical, the messages that read differently.
 *
 * Whole messages layered over the base dictionary, rather than a `staffLabel`
 * spliced into sentences — German can't be assembled that way (see
 * messages/salon.de.ts). The base dictionaries are the barbershop's wording,
 * so BARBERSHOP overlays nothing and renders exactly as before verticals
 * existed.
 */
const OVERLAYS: Record<Vertical, Record<Locale, Overlay>> = {
  BARBERSHOP: { de: {}, en: {} },
  SALON: { de: salonDe, en: salonEn },
};

/** Merged once per (vertical, locale) — four objects, built on first use. */
const merged = new Map<string, Record<MessageKey, string>>();

function messagesFor(locale: Locale, vertical: Vertical): Record<MessageKey, string> {
  const cacheKey = `${vertical}:${locale}`;
  let messages = merged.get(cacheKey);
  if (!messages) {
    messages = { ...DICTIONARIES[locale], ...OVERLAYS[vertical][locale] };
    merged.set(cacheKey, messages);
  }
  return messages;
}

/** BCP 47 tags for Intl and Luxon, per interface language. */
export const INTL_LOCALES: Record<Locale, string> = {
  de: "de-DE",
  // en-GB rather than en-US: day-first dates, which is what a shop in Germany
  // writes in either language.
  en: "en-GB",
};

/**
 * `vertical` defaults to the base wording for surfaces that belong to no
 * tenant — login, the root layout, a shop that doesn't exist. Anything that
 * renders for a tenant passes that tenant's vertical.
 */
export function createTranslator(
  locale: Locale,
  vertical: Vertical = "BARBERSHOP",
): Translator {
  const messages = messagesFor(locale, vertical);
  const plurals = new Intl.PluralRules(INTL_LOCALES[locale]);

  return (key, params) => {
    const resolved =
      key in messages
        ? (key as MessageKey)
        : (`${key}.${plurals.select(Number(params?.count)) === "one" ? "one" : "other"}` as MessageKey);

    return interpolate(messages[resolved], params);
  };
}

/** `{name}` → params.name. A placeholder with no param is left visible. */
function interpolate(template: string, params: MessageParams | undefined): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (placeholder, name: string) =>
    name in params ? String(params[name]) : placeholder,
  );
}

/**
 * Whether a string is a message key.
 *
 * For values that crossed a boundary as plain strings — chiefly Zod issue
 * messages, which the validation schemas write as keys so that validation
 * itself stays language-free.
 */
export function isMessageKey(value: string): value is MessageKey {
  return value in de;
}

/**
 * A message key with its parameters, packed into the one string a Zod issue
 * message can hold: "validation.bufferRange?max=60".
 *
 * For the few validation messages that quote a limit. The number stays owned
 * by the schema's constant rather than being copied into two dictionaries,
 * where it would drift the first time the constant changed.
 */
export function encodeMessage(key: MessageKey, params: MessageParams): string {
  const query = new URLSearchParams(
    Object.entries(params).map(([name, value]) => [name, String(value)]),
  );
  return `${key}?${query.toString()}`;
}

/**
 * Translate a string that is *probably* a message key — plain, or packed by
 * encodeMessage — showing it verbatim if not. Used for validation errors: a
 * key is the rule, but a raw library message reaching the screen untranslated
 * beats an empty error.
 */
export function translateMessage(t: Translator, value: string): string {
  const [key, query] = value.split("?", 2);
  if (!isMessageKey(key)) return value;

  return t(key, query ? Object.fromEntries(new URLSearchParams(query)) : undefined);
}
