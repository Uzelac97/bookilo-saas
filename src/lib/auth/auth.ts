import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

import { getUserByEmail } from "@/lib/db/users";
import { loginSchema } from "@/lib/validation/auth";

import { authConfig } from "./auth.config";
import { DUMMY_PASSWORD_HASH, verifyPassword } from "./password";

/**
 * DATABASE-BACKED HALF OF THE AUTH CONFIG.
 *
 * `authorize` touches Prisma and bcrypt. proxy.ts must import ./auth.config,
 * never this file — it runs on every matched request and has no reason to open
 * a database connection. Anything running in a server component, server action,
 * or route handler imports from here.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const { email, password } = parsed.data;
        const user = await getUserByEmail(email);

        if (!user) {
          // Burn the same ~250ms a real comparison costs. Returning early here
          // would make "no such account" measurably faster than "wrong
          // password" and let anyone enumerate which emails are registered.
          await verifyPassword(password, DUMMY_PASSWORD_HASH);
          return null;
        }

        const passwordMatches = await verifyPassword(
          password,
          user.passwordHash,
        );
        if (!passwordMatches) return null;

        // Whatever is returned here lands in the `user` argument of the jwt
        // callback. passwordHash deliberately does not travel any further.
        return {
          id: user.id,
          email: user.email,
          tenantId: user.tenantId,
          role: user.role,
        };
      },
    }),
  ],
});
