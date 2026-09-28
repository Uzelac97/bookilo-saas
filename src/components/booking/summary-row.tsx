/**
 * One label/value line in a booking summary's `<dl>`.
 *
 * No directive, so it renders in the server-rendered booked and cancel pages
 * and inside the client-rendered booking form alike.
 */
export function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-fg-muted">{label}</dt>
      <dd className="text-right font-medium text-fg">{value}</dd>
    </div>
  );
}
