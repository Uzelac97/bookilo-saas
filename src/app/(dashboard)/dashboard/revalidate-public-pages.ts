import { revalidatePath } from "next/cache";

/**
 * Drops the public shop pages from the caches, for dashboard writes that
 * change what a customer sees (services, staff, working hours, time off).
 *
 * A plain module rather than part of an actions file: `"use server"` would turn
 * this helper into a callable server action, which it has no reason to be.
 *
 * The build reports `/b/[slug]` and its children as dynamic today, so there is
 * no full route cache to bust. What this actually clears is the *client* router
 * cache — and that path is real rather than theoretical: the dashboard header
 * carries a "View public page" link, so an owner who retires a service and
 * immediately clicks it is exactly the person who would be served the stale
 * payload. It also keeps this correct if those routes ever gain
 * generateStaticParams or a `revalidate` export.
 *
 * "layout" rather than "page": "page" would cover `/b/[slug]` alone and leave
 * `/b/[slug]/book` showing the retired service in its picker. The literal
 * `[slug]` is the route pattern, so it covers every tenant — a dashboard session
 * carries a tenantId, not a slug.
 */
export function revalidatePublicPages() {
  revalidatePath("/b/[slug]", "layout");
}
