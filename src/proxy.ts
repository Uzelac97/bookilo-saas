import NextAuth from "next-auth";

// lib/auth/auth.config — NOT lib/auth/auth.
//
// Next 16's proxy convention always runs on the Node.js runtime, so Prisma
// would technically load here. Import auth.config anyway: this file runs on
// every request the matcher below accepts, and pulling in the Prisma-backed
// config would open a database connection on each one just to decide whether a
// JWT is present. Auth.js's split exists for exactly this reason.
import { authConfig } from "@/lib/auth/auth.config";

const { auth } = NextAuth(authConfig);

/**
 * An optimistic check only: "is there a JWT at all". It can't tell whether the
 * user that JWT names still exists — that needs the database, which this file
 * deliberately never touches — so lib/auth/session.ts re-verifies on every
 * dashboard render and action.
 *
 * Which is why the reverse redirect (signed in + on /login -> /dashboard) does
 * NOT live here. For a JWT whose user has been deleted, session.ts sends the
 * request to /login; a proxy that bounced every JWT on /login straight back to
 * /dashboard would loop the two forever. The login page does that redirect
 * itself, from the verified session.
 */
const proxy = auth((req) => {
  const { nextUrl } = req;
  const hasSession = Boolean(req.auth?.user?.tenantId);
  const isOnDashboard = nextUrl.pathname.startsWith("/dashboard");

  if (isOnDashboard && !hasSession) {
    const loginUrl = new URL("/login", nextUrl.origin);
    // Send them back where they were headed once they've signed in.
    loginUrl.searchParams.set("callbackUrl", nextUrl.pathname + nextUrl.search);
    return Response.redirect(loginUrl);
  }

  return undefined;
});

export default proxy;

export const config = {
  // Everything except Next internals, static assets, and Auth.js's own routes.
  // Do not add a `runtime` key here — Next rejects route segment config in a
  // proxy file outright.
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
