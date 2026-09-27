import type { MessageKey, Translator } from "./translate";

/**
 * Weekday names by the schema's 0 = Sunday numbering (schema.prisma,
 * WorkingHours.dayOfWeek), in the interface language.
 *
 * Abbreviations are their own keys rather than a slice of the full name:
 * German abbreviates to two letters ("Mo", "Di"), and slicing "Dienstag" to
 * three gives "Die", which is a word and not a weekday.
 */
const LONG = [
  "weekday.0",
  "weekday.1",
  "weekday.2",
  "weekday.3",
  "weekday.4",
  "weekday.5",
  "weekday.6",
] as const satisfies readonly MessageKey[];

const SHORT = [
  "weekdayShort.0",
  "weekdayShort.1",
  "weekdayShort.2",
  "weekdayShort.3",
  "weekdayShort.4",
  "weekdayShort.5",
  "weekdayShort.6",
] as const satisfies readonly MessageKey[];

export function weekdayName(
  t: Translator,
  dayOfWeek: number,
  width: "long" | "short" = "long",
): string {
  return t((width === "long" ? LONG : SHORT)[dayOfWeek]);
}
