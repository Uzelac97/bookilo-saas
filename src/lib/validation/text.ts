/**
 * Text predicates shared by every schema that takes a name a human typed.
 *
 * Plain module, no Zod: these are used inside `.refine()` on the public booking
 * form, the services screen and the staff screen, and keeping them free of the
 * schema they serve is what lets all three state the same rule without one
 * importing another's shape.
 */

/**
 * True when a string contains C0 or C1 control characters, or the Unicode line
 * and paragraph separators.
 *
 * Callers reject rather than strip, deliberately. A name with a line break in it
 * is a different value from the same name without one — usually a paste that
 * brought a second field along with it — and quietly rewriting what someone
 * typed means the shop calls a customer by a name they never gave. Trailing
 * whitespace is the opposite case and is still trimmed: nobody means to type it.
 *
 * The concrete reason a customer's name has to be a single line: it goes into
 * the subject header of the owner's notification email. That isn't header
 * injection with Resend — the SDK posts JSON to an HTTP API rather than writing
 * SMTP headers, so the transport encodes it — but it does produce a mangled
 * subject, and a value that can't survive being written on one line has no
 * business here. Service and staff names inherit the rule because they are
 * rendered into that same email and into the calendar's block labels.
 */
export function hasControlCharacters(value: string): boolean {
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;

    if (
      code <= 0x1f || // C0: tab, newline, carriage return, NUL, …
      (code >= 0x7f && code <= 0x9f) || // DEL and C1
      code === 0x2028 || // line separator
      code === 0x2029 // paragraph separator
    ) {
      return true;
    }
  }

  return false;
}
