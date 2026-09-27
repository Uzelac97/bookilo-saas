"use client";

import { VerticalContext } from "@/lib/i18n/client";
import type { Vertical } from "@/lib/vertical";

/**
 * Hands the tenant's vertical to every client component below it, so useT()
 * speaks the tenant's terminology. Mounted by the two layouts that know which
 * tenant they render: the dashboard (from the session) and the public shop
 * pages (from the URL slug). The component is the only export here — see the
 * note in lib/i18n/client.ts.
 */
export function VerticalProvider({
  vertical,
  children,
}: {
  vertical: Vertical;
  children: React.ReactNode;
}) {
  return <VerticalContext value={vertical}>{children}</VerticalContext>;
}
