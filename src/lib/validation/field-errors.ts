import { z } from "zod";

/**
 * The first message for each top-level field of a failed parse, keyed by field
 * name — the shape every form's `fieldErrors` state takes.
 *
 * First, not all: a field shows one message at a time, and Zod reports issues
 * in the order the schema checks them, so the first is the most basic one
 * ("required" before "too long").
 *
 * Issues with no field path (a refine on the whole object) have no input to
 * attach to and are dropped here. Every object-level refine in lib/validation
 * sets an explicit `path`, so none are lost today; a caller that needs to react
 * to one can read `error.issues` itself, as the public booking action does.
 *
 * Plain module with no directive, so the client booking form and the server
 * actions share it.
 */
export function fieldErrorsFrom<T>(
  error: z.ZodError<T>,
): Partial<Record<keyof T, string>> {
  const { fieldErrors } = z.flattenError(error);
  const firsts: Partial<Record<keyof T, string>> = {};

  for (const field in fieldErrors) {
    const message = fieldErrors[field]?.[0];
    if (message !== undefined) firsts[field] = message;
  }

  return firsts;
}
