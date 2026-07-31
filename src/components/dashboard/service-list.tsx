import Link from "next/link";

import { setServiceActiveAction } from "@/app/(dashboard)/dashboard/services/actions";
import { ServiceForm } from "@/components/dashboard/service-form";
import type { ManagedService } from "@/lib/db/services";
import { formatDuration, formatPrice } from "@/lib/format";

/**
 * The owner's list of services, with the row being edited swapped for its form.
 *
 * Which row is open lives in the URL (`?edit=<id>`), not in client state — the
 * same convention the calendar page sets out for `date` and `view`. It survives
 * a refresh, it can be linked to, and it keeps this a server component with no
 * hydration to pay for.
 *
 * Retired services are listed, not hidden. There is no hard-delete for Service
 * (CLAUDE.md), so "retired" is a state an owner can be in by accident, and a
 * screen that hides those rows offers no way back out of it.
 */
export function ServiceList({
  services,
  editingId,
}: {
  services: ManagedService[];
  editingId: string | undefined;
}) {
  const active = services.filter((service) => service.active);
  const retired = services.filter((service) => !service.active);

  return (
    <div className="flex flex-col gap-8">
      <Section
        title="Bookable"
        empty="Nothing bookable yet — add your first service above."
        services={active}
        editingId={editingId}
      />

      {retired.length > 0 ? (
        <Section
          title="Retired"
          hint="Not shown to customers. Existing appointments keep them."
          services={retired}
          editingId={editingId}
        />
      ) : null}
    </div>
  );
}

function Section({
  title,
  hint,
  empty,
  services,
  editingId,
}: {
  title: string;
  hint?: string;
  empty?: string;
  services: ManagedService[];
  editingId: string | undefined;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h2 className="text-sm font-semibold tracking-tight text-zinc-900">
          {title}
        </h2>
        {hint ? <p className="text-sm text-zinc-500">{hint}</p> : null}
      </div>

      {services.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-zinc-300 px-4 py-6 text-center text-sm text-zinc-500">
          {empty}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {services.map((service) => (
            <li
              key={service.id}
              className="rounded-2xl border border-zinc-200 bg-white p-4"
            >
              {service.id === editingId ? (
                <ServiceForm service={service} />
              ) : (
                <ServiceRow service={service} />
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ServiceRow({ service }: { service: ManagedService }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
      <div className="flex min-w-0 flex-col gap-0.5">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span
            className={[
              "font-medium",
              service.active ? "text-zinc-900" : "text-zinc-500",
            ].join(" ")}
          >
            {service.name}
          </span>
          {service.category ? (
            <span className="rounded-md bg-zinc-100 px-1.5 py-0.5 text-xs font-medium text-zinc-600">
              {service.category}
            </span>
          ) : null}
        </div>
        <span className="text-sm text-zinc-500">
          {formatDuration(service.durationMinutes)} ·{" "}
          {formatPrice(service.priceMinorUnits)}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <Link
          href={`/dashboard/services?edit=${service.id}`}
          className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100"
        >
          Edit
        </Link>

        {/* "Retire" is always active = false, never a delete: Booking.serviceId
            is onDelete: Restrict, so a real delete would either fail or take the
            shop's history with it (CLAUDE.md). */}
        <form action={setServiceActiveAction}>
          <input type="hidden" name="serviceId" value={service.id} />
          <input
            type="hidden"
            name="active"
            value={service.active ? "false" : "true"}
          />
          <button
            type="submit"
            className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100"
          >
            {service.active ? "Retire" : "Restore"}
          </button>
        </form>
      </div>
    </div>
  );
}
