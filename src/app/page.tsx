import { redirect } from "next/navigation";

/**
 * The bare domain, which nothing in the product links to.
 *
 * There is no marketing site and there is deliberately not going to be one here
 * — customers arrive at /b/{slug} from the shop, and the owner arrives at
 * /login. This route existed only as the create-next-app scaffold (Next.js
 * logo, "edit the page.tsx file", dark-mode classes for a theme this app
 * doesn't have), which is what a prospect saw if they typed the domain during a
 * demo.
 *
 * A redirect rather than a page, so there is nothing here to design, style or
 * keep in sync. /login rather than a 404 because the one person who reaches
 * this URL on purpose is the owner.
 */
export default function Home() {
  redirect("/login");
}
