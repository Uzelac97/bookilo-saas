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

const proxy = auth((req) => {
  const { nextUrl } = req;
  const isSignedIn = Boolean(req.auth?.user?.tenantId);
  const isOnDashboard = nextUrl.pathname.startsWith("/dashboard");
  const isOnLogin = nextUrl.pathname === "/login";

  if (isOnDashboard && !isSignedIn) {
    const loginUrl = new URL("/login", nextUrl.origin);
    // Send them back where they were headed once they've signed in.
    loginUrl.searchParams.set("callbackUrl", nextUrl.pathname + nextUrl.search);
    return Response.redirect(loginUrl);
  }

  if (isOnLogin && isSignedIn) {
    return Response.redirect(new URL("/dashboard", nextUrl.origin));
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
