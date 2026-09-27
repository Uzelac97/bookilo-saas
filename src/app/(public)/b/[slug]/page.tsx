import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";

import { OpeningHours } from "@/components/booking/opening-hours";
import { ServiceList } from "@/components/booking/service-list";
import { mergeOpeningHours } from "@/lib/availability/opening-hours";
import { getActiveServices } from "@/lib/db/services";
import { getWorkingHoursForActiveStaff } from "@/lib/db/staff";
import { getT } from "@/lib/i18n/server";
import type { MessageKey } from "@/lib/i18n/translate";
import type { Vertical } from "@/lib/vertical";

import { getShop } from "./shop";

/** Exhaustive over Vertical, so a new vertical without a label fails tsc. */
const BUSINESS_TYPE_LABELS: Record<Vertical, MessageKey> = {
  BARBERSHOP: "shop.businessTypeBarbershop",
  SALON: "shop.businessTypeSalon",
};

type PageProps = { params: Promise<{ slug: string }> };

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const tenant = await getShop(slug);
  const t = await getT(tenant?.businessType ?? null);

  if (!tenant) {
    return { title: t("shop.notFoundTitle") };
  }

  return {
    title: tenant.name,
    description: tenant.address
      ? t("shop.metaDescriptionWithAddress", {
          shop: tenant.name,
          address: tenant.address,
        })
      : t("shop.metaDescription", { shop: tenant.name }),
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
  const t = await getT(tenant.businessType);
  const businessType = BUSINESS_TYPE_LABELS[tenant.businessType];

  return (
    <div className="flex flex-1 flex-col bg-canvas px-4 py-10 sm:py-16">
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-10">
        {tenant.heroImageUrl ? (
          // Inside the column, not full-bleed like the Kastanien marketing
          // hero: no text sits on this photograph, so it needs no scrim and no
          // viewport-height section, just a card that matches the page's other
          // rounded-2xl surfaces.
          //
          // `sizes` is the whole upscaling guard. The box can never be wider
          // than the 672px column (max-w-2xl) or the viewport less the px-4
          // gutters, so at 3x DPR the largest request is ~2016px — below any
          // photo wide enough to be a hero. No width cap is needed the way the
          // Kastanien page needs one for a 100vw image.
          //
          // alt="" because the h1 directly below names the shop; describing
          // the photo as "Salon X" would only repeat it to a screen reader.
          <div className="relative aspect-video overflow-hidden rounded-2xl sm:aspect-21/9">
            <Image
              src={tenant.heroImageUrl}
              alt=""
              fill
              priority
              sizes="(min-width: 704px) 672px, calc(100vw - 2rem)"
              className="object-cover"
            />
          </div>
        ) : null}

        <header className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium text-fg-muted">
              {t(businessType)}
            </p>
            {/* Larger than the h1 on the three transactional pages, and the
                only place that differs. This is the shop's front door and the
                one heading that is the shop's own name rather than a step in a
                process. */}
            <h1 className="text-3xl font-semibold tracking-tight text-fg sm:text-4xl">
              {tenant.name}
            </h1>
          </div>

          <div className="flex flex-col gap-1 text-sm text-fg-tertiary">
            {tenant.address ? <p>{tenant.address}</p> : null}
            {tenant.phone ? (
              // The one control on this page that isn't a booking, and on a
              // phone it is a dial button — so it gets the same 44px the Book
              // buttons below it get, rather than being a line of text that
              // happens to be tappable.
              <a
                href={`tel:${tenant.phone.replace(/\s+/g, "")}`}
                className="inline-flex min-h-11 w-fit items-center font-medium text-fg underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              >
                {tenant.phone}
              </a>
            ) : null}
          </div>
        </header>

        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold tracking-tight text-fg">
            {t("shop.services")}
          </h2>
          <ServiceList
            services={services}
            slug={tenant.slug}
            vertical={tenant.businessType}
          />
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold tracking-tight text-fg">
            {t("shop.openingHours")}
          </h2>
          <div className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
            <OpeningHours
              days={openingHours}
              vertical={tenant.businessType}
            />
          </div>
        </section>
      </main>
    </div>
  );
}
