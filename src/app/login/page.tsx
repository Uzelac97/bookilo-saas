import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { LoginForm } from "@/components/auth/login-form";
import { getSession } from "@/lib/auth/session";

// Spelled out rather than relying on a template: /login sits outside the
// (dashboard) group, so it inherits the root layout's untemplated title.
export const metadata: Metadata = {
  title: "Sign in · Bookilo",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  // Already signed in: skip the form. Decided here from the verified session
  // rather than in proxy.ts, whose JWT-only check would also bounce a deleted
  // user's stale token back to /dashboard — see the comment there.
  if (await getSession()) redirect("/dashboard");

  const { callbackUrl } = await searchParams;

  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 px-4 py-16">
      <div className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
        <div className="mb-6 flex flex-col gap-1">
          {/* The one screen in the product that carries the brand. Everywhere
              else an owner looks, the header shows their own shop's name — this
              is the page they reach before a tenant is resolved, so it's the
              only place Bookilo can identify itself without talking over a
              customer's shop. */}
          <span className="text-xs font-semibold tracking-widest text-zinc-400 uppercase">
            Bookilo
          </span>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900">
            Sign in
          </h1>
          <p className="text-sm text-zinc-500">
            Manage your bookings, staff, and services.
          </p>
        </div>

        <LoginForm callbackUrl={callbackUrl ?? "/dashboard"} />
      </div>
    </div>
  );
}
