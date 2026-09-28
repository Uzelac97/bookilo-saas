import { getT } from "@/lib/i18n/server";

/**
 * The public pages' 404 card: a heading and one line of explanation.
 *
 * Shared by the shop-level 404 (a slug that resolves to no tenant) and the
 * token-level one below. They say different things, so each passes its own
 * copy; what they share is only the look.
 */
export function NotFoundCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-1 items-center justify-center bg-canvas px-4 py-16">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-8 text-center shadow-sm">
        <h1 className="text-xl font-semibold tracking-tight text-fg">{title}</h1>
        <p className="mt-2 text-sm text-fg-muted">{body}</p>
      </div>
    </div>
  );
}

/**
 * The 404 for a booked/ or cancel/ link whose token resolves to no booking, or
 * to another shop's booking. Both segments re-export this as their not-found.
 *
 * The shop in the URL may well exist — it's the link that failed, most often
 * because a mail client truncated it — so saying "shop not found" here would
 * tell the customer their barbershop is gone. And "no such token" and "another
 * shop's token" stay one message: telling them apart is exactly what a probing
 * request wants to learn.
 *
 * No vertical: a not-found receives no params, and resolving the tenant here
 * would mean trusting a slug the page just refused. So the copy is written to
 * be vertical-neutral ("the place you booked with") rather than saying "shop",
 * because a salon's customers land here too.
 */
export async function InvalidLinkNotFound() {
  const t = await getT(null);

  return (
    <NotFoundCard
      title={t("booking.linkInvalidTitle")}
      body={t("booking.linkInvalidBody")}
    />
  );
}
