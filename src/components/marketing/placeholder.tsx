/**
 * A block standing in for a photograph that does not exist.
 *
 * Nothing in this repo holds an image of Kastanien Barbershop: `public/` has
 * only the Next scaffold's SVGs, and `Staff.photoUrl` — the one image column in
 * the schema — is left null by prisma/seed.ts for all three barbers. The
 * marketing page's brief forbids inventing content and presenting it as real,
 * so the hero and the About portrait get this instead of a stock photo.
 *
 * It is deliberately NOT a subtle grey box. It sizes itself to whatever the
 * real image would occupy (the hero one is full-bleed and 85svh tall), and it
 * says out loud what it is, because a placeholder that reads as a design choice
 * is one that ships.
 */
export function Placeholder({
  label,
  note,
  className,
}: {
  label: string;
  /** Optional second line: why there is nothing here yet. */
  note?: string;
  className?: string;
}) {
  return (
    <div
      className={`flex items-center justify-center overflow-hidden bg-linear-to-br from-shop-walnut via-shop-ink to-shop-walnut ${className ?? ""}`}
    >
      {/* The inset dashed frame, rather than a border on the element itself:
          the hero instance is full-bleed, and a border there would draw a line
          down the edge of the viewport. */}
      <div className="m-4 flex max-w-md flex-col items-center gap-3 border border-dashed border-shop-brass/40 px-6 py-10 text-center sm:m-8">
        <span className="text-xs font-semibold uppercase tracking-[0.25em] text-shop-brass">
          {label}
        </span>
        {note ? (
          <span className="text-sm leading-relaxed text-shop-muted">{note}</span>
        ) : null}
      </div>
    </div>
  );
}
