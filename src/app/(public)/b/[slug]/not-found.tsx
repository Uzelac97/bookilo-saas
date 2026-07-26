/**
 * The 404 for a slug that doesn't resolve to a tenant. Without this, a mistyped
 * URL falls through to Next's raw default 404 — and this is the one address
 * that gets printed on a card and handed to real customers.
 */
export default function ShopNotFound() {
  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 px-4 py-16">
      <div className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">
          Shop not found
        </h1>
        <p className="mt-2 text-sm text-zinc-500">
          This booking page doesn&apos;t exist. Check the link, or ask the shop
          for their booking address.
        </p>
      </div>
    </div>
  );
}
