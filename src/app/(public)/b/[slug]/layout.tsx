import { VerticalProvider } from "@/components/i18n/vertical-provider";
import { PreferenceToggles } from "@/components/preferences/preference-toggles";
import { getTheme } from "@/lib/preferences-server";

import { getShop } from "./shop";

/**
 * Wraps every public page of a shop — the shop page, book, booked, cancel and
 * the 404 — with the language and theme switches, and gives client components
 * the shop's vertical, so the booking flow says "stylist" for a salon and
 * "barber" for a barbershop.
 *
 * The switches read no tenant data: their actions set only the visitor's own
 * cookies. That is why they can sit above a 404 as safely as above a real shop.
 *
 * A slug that resolves to nothing gets no vertical: the page below calls
 * notFound(), and the 404 belongs to no tenant.
 */
export default async function ShopLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [tenant, theme] = await Promise.all([getShop(slug), getTheme()]);

  const page = (
    // The ground is painted here as well as by each page, so the toggle row
    // sits on it rather than on the bare body.
    <div className="flex flex-1 flex-col bg-canvas">
      <div className="mx-auto flex w-full max-w-2xl justify-end px-4 pt-4">
        <PreferenceToggles theme={theme} />
      </div>
      {children}
    </div>
  );

  if (!tenant) return page;

  return <VerticalProvider vertical={tenant.businessType}>{page}</VerticalProvider>;
}
