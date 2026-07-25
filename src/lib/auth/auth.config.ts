import type { NextAuthConfig } from "next-auth";

/**
 * DEPENDENCY-FREE HALF OF THE AUTH CONFIG.
 *
 * This file is what proxy.ts imports, so it must never (transitively) import
 * Prisma, bcrypt, or anything else expensive to load. proxy.ts runs on every
 * matched request; the Prisma-backed Credentials provider lives in ./auth.ts
 * and is only pulled in where a request actually needs the database.
 *
 * The jwt/session callbacks live HERE rather than in auth.ts on purpose. They're
 * pure token shaping with no DB access — and keeping them here means the
 * `auth()` proxy.ts builds from this config sees a fully shaped session
 * including tenantId. If they lived in auth.ts, proxy.ts would quietly see a
 * session with no tenantId, which works right up until the first proxy-level
 * tenant check and then fails in a very confusing way.
 */
export const authConfig = {
  pages: {
    signIn: "/login",
  },
  // No Account/Session tables — see EXECUTION-PLAN.md §3.
  session: { strategy: "jwt" },
  // Filled in by auth.ts. proxy.ts only ever decodes an existing JWT, so it
  // never needs a provider.
  providers: [],
  callbacks: {
    jwt({ token, user }) {
      // `user` is only present on the sign-in call; afterwards the token is
      // just re-read, so everything we need must be copied onto it here.
      if (user) {
        token.userId = user.id as string;
        token.tenantId = user.tenantId;
        token.role = user.role;
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = token.userId;
      session.user.tenantId = token.tenantId;
      session.user.role = token.role;
      return session;
    },
  },
} satisfies NextAuthConfig;
