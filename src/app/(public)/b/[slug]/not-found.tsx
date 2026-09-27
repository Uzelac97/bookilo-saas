import { getT } from "@/lib/i18n/server";

/**
 * The 404 for a slug that doesn't resolve to a tenant. Without this, a mistyped
 * URL falls through to Next's raw default 404 — and this is the one address
 * that gets printed on a card and handed to real customers.
 */
export default async function ShopNotFound() {
  const t = await getT(null);

  return (
    <div className="flex flex-1 items-center justify-center bg-canvas px-4 py-16">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-8 text-center shadow-sm">
        <h1 className="text-xl font-semibold tracking-tight text-fg">
          {t("shop.notFoundTitle")}
        </h1>
        <p className="mt-2 text-sm text-fg-muted">
          {t("shop.notFoundBody")}
        </p>
      </div>
    </div>
  );
}
