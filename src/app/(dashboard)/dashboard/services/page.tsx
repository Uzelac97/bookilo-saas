import type { Metadata } from "next";

import { ServiceForm } from "@/components/dashboard/service-form";
import { ServiceList } from "@/components/dashboard/service-list";
import { getCurrentTenant } from "@/lib/auth/session";
import { getServicesForTenant } from "@/lib/db/services";
import { getDashboardT } from "@/lib/i18n/server";
import { firstParam } from "@/lib/search-params";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDashboardT();
  return { title: t("nav.services") };
}

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * What the shop sells, and what it used to sell.
 *
 * The tenant comes from the session and nothing else (CLAUDE.md rule 2). The
 * only client-side state is `?edit=<id>`, in the URL, exactly as the calendar
 * page carries `date` and `view` — a refresh keeps the open form, and nothing
 * here is client-fetched.
 *
 * An id in that param that isn't this tenant's simply matches no row and the
 * list renders normally, so there is nothing to validate: the read is already
 * scoped, and the write it leads to is scoped again in its own where clause.
 */
export default async function ServicesPage({ searchParams }: PageProps) {
  const tenant = await getCurrentTenant();
  const query = await searchParams;
  const services = await getServicesForTenant(tenant.id);
  const t = await getDashboardT();

  const editingId = firstParam(query.edit);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-fg">
          {t("nav.services")}
        </h1>
        <p className="text-sm text-fg-muted">
          {t("services.intro")}
        </p>
      </header>

      <section className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-4 sm:p-6">
        <h2 className="text-sm font-semibold tracking-tight text-fg">
          {t("services.addHeading")}
        </h2>
        <ServiceForm />
      </section>

      <ServiceList services={services} editingId={editingId} />
    </div>
  );
}
