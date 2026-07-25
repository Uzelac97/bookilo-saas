import type { DefaultSession } from "next-auth";

import type { UserRole } from "@/lib/db/users";

// Teaches TypeScript about the fields the jwt/session callbacks in
// lib/auth/auth.config.ts put on the token and session, so nothing downstream
// has to reach for `any` to read session.user.tenantId.

declare module "next-auth" {
  /** Returned by `authorize` in lib/auth/auth.ts. */
  interface User {
    tenantId: string;
    role: UserRole;
  }

  interface Session {
    user: {
      id: string;
      tenantId: string;
      role: UserRole;
    } & DefaultSession["user"];
  }
}

// Augment @auth/core/jwt, not next-auth/jwt: the latter is a bare
// `export * from "@auth/core/jwt"`, so declaring an interface against it
// creates a second, unrelated JWT type instead of merging with the real one —
// and every token field silently stays `unknown`.
declare module "@auth/core/jwt" {
  interface JWT {
    userId: string;
    tenantId: string;
    role: UserRole;
  }
}
