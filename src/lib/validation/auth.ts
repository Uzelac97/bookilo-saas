import { z } from "zod";

// Messages are keys into lib/i18n/messages, not prose: validation runs on the
// server and the client alike and has no business knowing the language. The
// form translates the key at render (translateMessage), which is also where a
// key with parameters — encodeMessage — is unpacked.
//
// Normalize before validating: emails are stored lowercase, and a stray leading
// space from a phone keyboard shouldn't read as a wrong account.
export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email("validation.emailInvalid")),
  password: z.string().min(1, "validation.passwordRequired"),
});
