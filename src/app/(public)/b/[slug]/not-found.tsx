import { NotFoundCard } from "@/components/booking/not-found-card";
import { getT } from "@/lib/i18n/server";

/**
 * The 404 for a slug that doesn't resolve to a tenant. Without this, a mistyped
 * URL falls through to Next's raw default 404 — and this is the one address
 * that gets printed on a card and handed to real customers.
 *
 * A bad token under booked/ or cancel/ does not land here: those segments have
 * their own not-found, because there the shop exists and the link is what's
 * wrong.
 */
export default async function ShopNotFound() {
  const t = await getT(null);

  return (
    <NotFoundCard
      title={t("shop.notFoundTitle")}
      body={t("shop.notFoundBody")}
    />
  );
}
