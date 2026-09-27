/**
 * Which of a service's two names a customer reads.
 *
 * The tenant's own content, not interface text, so it can't live in the
 * dictionaries: `name` and `category` are what the owner typed, in German, and
 * `nameEn` / `categoryEn` are optional English versions of them. English shows
 * the English value where there is one and falls back to the German where
 * there isn't — an untranslated service is still a bookable service.
 *
 * Plain and directive-free, so server components, the client booking form and
 * the marketing page all share one rule. Emails don't call this: they are
 * always German (EXECUTION-PLAN.md, decision 11) and use `name` directly.
 */
import type { Locale } from "@/lib/preferences";

export function serviceName(
  service: { name: string; nameEn?: string | null },
  locale: Locale,
): string {
  return (locale === "en" && service.nameEn) || service.name;
}

/**
 * A category heading. Null in, null out — "no category" is rendered by the
 * caller as its own translated "Other", not by this function.
 */
export function categoryLabel(
  group: { category: string | null; categoryEn?: string | null },
  locale: Locale,
): string | null {
  if (group.category === null) return null;
  return (locale === "en" && group.categoryEn) || group.category;
}

/**
 * The English label for a category *group*. `categoryEn` is stored per
 * service, so services grouped under one `category` can disagree, or some can
 * leave it blank; the first one set wins, so one translated service is enough
 * to label the group.
 */
export function groupCategoryEn(
  services: { categoryEn?: string | null }[],
): string | null {
  return services.find((service) => service.categoryEn)?.categoryEn ?? null;
}
