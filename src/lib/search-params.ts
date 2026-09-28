/**
 * One value from a page's `searchParams`. Next types each value as
 * `string | string[] | undefined`, because a key can repeat (`?date=a&date=b`);
 * every page here reads a repeated key as its first occurrence.
 */
export function firstParam(
  value: string | string[] | undefined,
): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
