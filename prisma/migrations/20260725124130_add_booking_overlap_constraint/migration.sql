-- Overlap prevention for Booking. Prisma's schema language cannot express an
-- exclusion constraint, so this migration is hand-written. See the rationale
-- block at the bottom of prisma/schema.prisma.
--
-- Never run `prisma db push` on this project: it has no record of anything below
-- and will drop it as unrecognised drift.

-- btree_gist supplies the GiST operator class for the scalar "staffId" equality
-- operator, so it can sit in the same index as the range overlap operator.
-- Available on Neon without superuser.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- This is the real guarantee against double-booking a barber under concurrent
-- requests. lib/availability/slots.ts is only the friendly version of it.
--
-- Ranges over "blockedUntil" (endAt + tenant.bufferMinutes, snapshotted at
-- creation) rather than "endAt", so bufferMinutes is enforced under concurrency
-- and not just in the UI.
--
-- The status list includes COMPLETED, not just CONFIRMED: otherwise marking a
-- booking complete silently reopens its own slot. The availability query in
-- slots.ts must treat the identical status set as occupied, or the UI will show
-- ghost slots that fail at submit.
--
-- tsrange, not tstzrange, because every DateTime column in this schema is
-- TIMESTAMP(3) without timezone (see CLAUDE.md). If a column is ever changed to
-- @db.Timestamptz, this must change to tstzrange in the same migration.
--
-- tsrange is half-open: [start, end). Genuinely back-to-back bookings with
-- buffer = 0 (10:00-10:30 and 10:30-11:00) do not overlap and are both legal.
-- scripts/probe-exclusion-constraint.ts asserts that, and the rejection case.
ALTER TABLE "Booking"
ADD CONSTRAINT no_overlapping_bookings
EXCLUDE USING gist (
  "staffId" WITH =,
  tsrange("startAt", "blockedUntil") WITH &&
) WHERE (status IN ('CONFIRMED', 'COMPLETED'));
