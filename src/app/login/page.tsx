import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { LoginForm } from "@/components/auth/login-form";
import { PreferenceToggles } from "@/components/preferences/preference-toggles";
import { getSession } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { getTheme } from "@/lib/preferences-server";

// Spelled out rather than relying on a template: /login sits outside the
// (dashboard) group, so it inherits the root layout's untemplated title.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT(null);
  return { title: `${t("login.title")} · Bookilo` };
}

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
  const [t, theme] = await Promise.all([getT(null), getTheme()]);

  return (
    <div className="relative flex flex-1 items-center justify-center bg-canvas px-4 py-16">
      <div className="absolute top-4 right-4">
        <PreferenceToggles theme={theme} />
      </div>

      <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-8 shadow-sm">
        <div className="mb-6 flex flex-col gap-1">
          {/* The one screen in the product that carries the brand. Everywhere
              else an owner looks, the header shows their own shop's name — this
              is the page they reach before a tenant is resolved, so it's the
              only place Bookilo can identify itself without talking over a
              customer's shop. */}
          <span className="text-xs font-semibold tracking-widest text-fg-faint uppercase">
            Bookilo
          </span>
          <h1 className="text-xl font-semibold tracking-tight text-fg">
            {t("login.title")}
          </h1>
          <p className="text-sm text-fg-muted">
            {t("login.subtitle")}
          </p>
        </div>

        <LoginForm callbackUrl={callbackUrl ?? "/dashboard"} />
      </div>
    </div>
  );
}
