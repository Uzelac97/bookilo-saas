import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";

import { OpeningHours } from "@/components/booking/opening-hours";
import { ServiceList } from "@/components/booking/service-list";
import { mergeOpeningHours } from "@/lib/availability/opening-hours";
import { getActiveServices } from "@/lib/db/services";
import { getWorkingHoursForActiveStaff } from "@/lib/db/staff";
import { getTenantBySlug } from "@/lib/db/tenant";

/**
 * generateMetadata and the page component both need the tenant, and Next's
 * automatic request deduplication only covers fetch() — a Prisma call gets none
 * of it. React's cache() gives the second caller a per-request memo hit instead
 * of a second query.
 *
 * Measured, because the failure mode here is subtler than "two round trips":
 * without the wrapper both lookups really are issued, but Prisma's findUnique
 * dataloader coalesces them into one round trip
 * (`WHERE slug IN ($1,$2)` — the same slug twice) as long as they land in the
 * same tick. So this is not the difference between one query and two; it's the
 * difference between deduplicating explicitly and relying on that batching
 * heuristic to keep holding. With cache(): `WHERE slug = $1 LIMIT 1`, once.
 *
 * It lives here rather than in lib/db/tenant.ts on purpose — that layer is
 * plain async functions that also run from scripts and server actions, where a
 * React render scope doesn't exist. Framework machinery stays in the route file.
 */
const getShop = cache(async (slug: string) => getTenantBySlug(slug));

const BUSINESS_TYPE_LABELS: Record<string, string> = {
  BARBERSHOP: "Barbershop",
};

type PageProps = { params: Promise<{ slug: string }> };

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const tenant = await getShop(slug);

  if (!tenant) {
    return { title: "Shop not found" };
  }

  return {
    title: tenant.name,
    description: tenant.address
      ? `Book an appointment at ${tenant.name}, ${tenant.address}.`
      : `Book an appointment at ${tenant.name}.`,
  };
}

export default async function BusinessPage({ params }: PageProps) {
  const { slug } = await params;

  // The public tenant-resolution path: slug from the URL, resolved server-side
  // on every request. The dashboard's path (session -> tenantId) is the other
  // one, and the two never mix (EXECUTION-PLAN.md §3).
  const tenant = await getShop(slug);
  if (!tenant) notFound();

  const [services, workingHours] = await Promise.all([
    getActiveServices(tenant.id),
    getWorkingHoursForActiveStaff(tenant.id),
  ]);

  const openingHours = mergeOpeningHours(workingHours);

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 px-4 py-10 sm:py-16">
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-10">
        <header className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium text-zinc-500">
              {BUSINESS_TYPE_LABELS[tenant.businessType] ?? "Appointments"}
            </p>
            <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">
              {tenant.name}
            </h1>
          </div>

          <div className="flex flex-col gap-1 text-sm text-zinc-600">
            {tenant.address ? <p>{tenant.address}</p> : null}
            {tenant.phone ? (
              <a
                href={`tel:${tenant.phone.replace(/\s+/g, "")}`}
                className="w-fit font-medium text-zinc-900 underline-offset-4 hover:underline"
              >
                {tenant.phone}
              </a>
            ) : null}
          </div>
        </header>

        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold tracking-tight text-zinc-900">
            Services
          </h2>
          <ServiceList services={services} slug={tenant.slug} />
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold tracking-tight text-zinc-900">
            Opening hours
          </h2>
          <div className="rounded-2xl border border-zinc-200 bg-white p-4">
            <OpeningHours days={openingHours} />
          </div>
        </section>
      </main>
    </div>
  );
}
