import { z } from "zod";

// Normalize before validating: emails are stored lowercase, and a stray leading
// space from a phone keyboard shouldn't read as a wrong account.
export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email("Enter a valid email address.")),
  password: z.string().min(1, "Enter your password."),
});

export type LoginInput = z.infer<typeof loginSchema>;
