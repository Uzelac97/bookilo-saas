import { DateTime } from "luxon";
import { describe, expect, it } from "vitest";

import {
  canCancel,
  CANCEL_TOKEN_GRACE_PERIOD_DAYS,
  canResolveCancelToken,
} from "./cancellation";

const WINDOW = 120;

/** A UTC instant, written the way the database stores one. */
function utc(iso: string): Date {
  return new Date(`${iso}Z`);
}

/** A Berlin wall-clock time, resolved to the instant it actually names. */
function berlin(iso: string): Date {
  const local = DateTime.fromISO(iso, { zone: "Europe/Berlin" });
  if (!local.isValid) throw new Error(`invalid Berlin time: ${iso}`);

  return local.toJSDate();
}

describe("canCancel", () => {
  it("allows a cancellation comfortably ahead of the window", () => {
    expect(
      canCancel({
        startAt: utc("2026-08-04T14:00:00"),
        now: utc("2026-08-03T09:00:00"),
        windowMinutes: WINDOW,
      }),
    ).toBe(true);
  });

  it("refuses one inside the window", () => {
    expect(
      canCancel({
        startAt: utc("2026-08-04T14:00:00"),
        now: utc("2026-08-04T13:00:00"),
        windowMinutes: WINDOW,
      }),
    ).toBe(false);
  });

  it("gives the exact boundary to the customer", () => {
    // "Cancel up to 2 hours before" reads as inclusive to the person doing the
    // cancelling, so exactly 120 minutes out still goes through.
    expect(
      canCancel({
        startAt: utc("2026-08-04T14:00:00"),
        now: utc("2026-08-04T12:00:00"),
        windowMinutes: WINDOW,
      }),
    ).toBe(true);

    // One millisecond later is inside the window.
    expect(
      canCancel({
        startAt: utc("2026-08-04T14:00:00"),
        now: new Date(utc("2026-08-04T12:00:00").getTime() + 1),
        windowMinutes: WINDOW,
      }),
    ).toBe(false);
  });

  it("refuses once the appointment has started or passed", () => {
    for (const now of ["2026-08-04T14:00:00", "2026-08-04T15:30:00"]) {
      expect(
        canCancel({
          startAt: utc("2026-08-04T14:00:00"),
          now: utc(now),
          windowMinutes: WINDOW,
        }),
      ).toBe(false);
    }
  });

  it("treats a zero window as 'any time before it starts'", () => {
    // A shop that hasn't set a window shouldn't accidentally block anyone.
    expect(
      canCancel({
        startAt: utc("2026-08-04T14:00:00"),
        now: utc("2026-08-04T13:59:59"),
        windowMinutes: 0,
      }),
    ).toBe(true);
  });

  it("measures real elapsed time across a DST change, not clock hours", () => {
    // Europe/Berlin springs forward on 2026-03-29: 02:00 CET becomes 03:00 CEST,
    // so 01:30 and 03:30 are one real hour apart despite reading two hours apart
    // on the wall. Wall-clock subtraction would put this customer exactly on a
    // 120-minute boundary and let them cancel; they are actually 60 minutes out.
    const startAt = berlin("2026-03-29T03:30:00");
    const now = berlin("2026-03-29T01:30:00");

    expect(startAt.getTime() - now.getTime()).toBe(60 * 60_000);
    expect(canCancel({ startAt, now, windowMinutes: WINDOW })).toBe(false);
  });

  it("is unaffected by DST in the other direction too", () => {
    // Autumn back: 03:00 CEST becomes 02:00 CET on 2026-10-25, so 01:30 and
    // 03:30 are three real hours apart and the cancellation stands.
    const startAt = berlin("2026-10-25T03:30:00");
    const now = berlin("2026-10-25T01:30:00");

    expect(startAt.getTime() - now.getTime()).toBe(3 * 60 * 60_000);
    expect(canCancel({ startAt, now, windowMinutes: WINDOW })).toBe(true);
  });
});

describe("canResolveCancelToken", () => {
  const GRACE_MS = CANCEL_TOKEN_GRACE_PERIOD_DAYS * 24 * 60 * 60_000;
  const endAt = utc("2026-08-04T14:00:00");

  it("resolves while the appointment is still in the future", () => {
    expect(canResolveCancelToken(endAt, utc("2026-08-03T09:00:00"))).toBe(
      true,
    );
  });

  it("resolves a few hours after the appointment has ended", () => {
    expect(canResolveCancelToken(endAt, utc("2026-08-04T18:00:00"))).toBe(
      true,
    );
  });

  it("stops resolving once the grace period has elapsed", () => {
    const now = new Date(endAt.getTime() + GRACE_MS + 24 * 60 * 60_000);

    expect(canResolveCancelToken(endAt, now)).toBe(false);
  });

  it("is inclusive at the exact boundary, and expired one millisecond later", () => {
    expect(canResolveCancelToken(endAt, new Date(endAt.getTime() + GRACE_MS))).toBe(
      true,
    );

    expect(
      canResolveCancelToken(endAt, new Date(endAt.getTime() + GRACE_MS + 1)),
    ).toBe(false);
  });
});
