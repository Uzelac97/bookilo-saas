/**
 * The presentation-side shaping the booking flow needs on top of computeSlots:
 * merging per-staff slots into one "any barber" list, and deciding which
 * calendar days a customer may pick.
 *
 * PURE, like slots.ts and opening-hours.ts next door. No I/O and no internal
 * `new Date()` — `now` is injected so the horizon and "is today" tests are
 * deterministic.
 *
 * Unlike opening-hours.ts this does import Luxon: it works with real instants
 * and tenant-local calendar days, so DST is genuinely in play here.
 *
 * This does NOT decide bookability. computeSlots owns that, and it owns the
 * agreement with the exclusion constraint. Everything here operates on slots
 * that function already declared open.
 */
import { DateTime } from "luxon";

import type { StaffSlots } from "./slots";

/**
 * How far ahead a customer may book.
 *
 * Deliberately a module constant, not a Tenant column — same call as
 * SLOT_STEP_MINUTES in slots.ts. Making it per-tenant is a migration, and no
 * customer has asked for one yet.
 */
export const BOOKING_HORIZON_DAYS = 30;

/** How many days the date strip shows at once. */
export const STRIP_LENGTH = 7;

/**
 * The `?staff=` sentinel for "no preference" — never a real staff id.
 *
 * Lives in this plain module rather than beside the picker that renders it, and
 * that placement is load-bearing. staff-picker.tsx is `"use client"`, and every
 * export of a client module becomes a *client reference* when a server
 * component imports it: the booking page's server render would hold a throwing
 * proxy instead of the string "any", with no type error to warn anyone (the
 * ANY_STAFF case in CLAUDE.md).
 *
 * It sits next to resolveBookingDate on purpose: that function decides how the
 * `?date=` parameter is interpreted, and this is the same job for `?staff=`.
 */
export const ANY_STAFF = "any";

/**
 * One pickable time, plus every barber free at it.
 *
 * `staffIds` is the reason this isn't just a Date. The "any barber" path has to
 * turn a chosen time into a concrete staff member at submit, and it must do so
 * deterministically — see the ordering contract documented on getActiveStaff
 * and getStaffAvailability in lib/db/*. The array preserves the order those
 * queries returned, and the resolver takes the first entry.
 */
export type BookableSlot = {
  /** A UTC instant. Formatting happens at the boundary, in the tenant's zone. */
  startAt: Date;
  /** Never empty — a slot with no free barber is not a slot. */
  staffIds: string[];
};

export type StripDay = {
  /** "2026-07-28", a calendar day in the tenant's timezone. */
  date: string;
  isToday: boolean;
  /** False for days outside [today, today + BOOKING_HORIZON_DAYS]. */
  bookable: boolean;
};

/**
 * The union of every barber's open slots, deduped by instant and sorted.
 *
 * Two barbers free at 14:30 is one 14:30 button backed by two ids, not two
 * buttons — that's the whole point of the "any barber" default. A fully-booked
 * barber contributes nothing but must not remove anyone else's times, which is
 * why this is a union and not an intersection.
 */
export function mergeStaffSlots(perStaff: StaffSlots[]): BookableSlot[] {
  // Keyed by epoch millis rather than the Date object — two Dates for the same
  // instant are different keys by identity, which would defeat the dedupe.
  const byInstant = new Map<number, string[]>();

  for (const member of perStaff) {
    for (const slot of member.slots) {
      const key = slot.getTime();
      const existing = byInstant.get(key);

      if (existing) {
        // Append, never sort: input order is the tie-break that decides which
        // barber an "any" booking resolves to.
        existing.push(member.staffId);
        continue;
      }

      byInstant.set(key, [member.staffId]);
    }
  }

  return [...byInstant.entries()]
    // Map iteration is insertion-ordered, and staff arrive one at a time, so the
    // raw entries interleave rather than ascend. Sorting is not optional here.
    .sort(([a], [b]) => a - b)
    .map(([millis, staffIds]) => ({ startAt: new Date(millis), staffIds }));
}

/**
 * Finds the offered slot matching a requested instant and barber, or null.
 *
 * This is the predicate the submission action gates on, kept pure and next to
 * mergeStaffSlots so it can be tested directly. Two conditions, both required:
 * the instant must be one the server just computed as open, and the requested
 * barber must be among the ones free at it. Checking only the instant would let
 * a customer be booked with a barber who is busy at that moment but whose
 * colleague is free.
 *
 * Compared by epoch millis, not by Date identity or reference — the requested
 * instant arrives as a freshly parsed Date and would never be `===` anything.
 */
export function findSlot(
  slots: BookableSlot[],
  startAt: Date,
  staffId: string,
): BookableSlot | null {
  const requested = startAt.getTime();

  return (
    slots.find(
      (slot) =>
        slot.startAt.getTime() === requested && slot.staffIds.includes(staffId),
    ) ?? null
  );
}

/**
 * Validates and clamps a `?date=` parameter into the bookable window.
 *
 * Clamps rather than throws on purpose: a stale bookmark, a hand-edited URL, or
 * a link shared a month late should land the customer on today, not on a 500.
 * Anything unparseable, in the past, or beyond the horizon collapses to the
 * nearest legal day.
 */
export function resolveBookingDate(
  raw: string | undefined,
  now: Date,
  timezone: string,
): string {
  const today = todayInZone(now, timezone);
  if (!raw) return today;

  const parsed = DateTime.fromISO(raw, { zone: timezone });
  if (!parsed.isValid) return today;

  const requested = parsed.toISODate();
  if (!requested) return today;

  if (requested < today) return today;

  const horizon = lastBookableDate(now, timezone);
  return requested > horizon ? horizon : requested;
}

/**
 * The strip of days to render, ending on or after `selectedDate`.
 *
 * Anchored so the selected day is always visible: the strip starts at the
 * selected date rather than at today, so paging forward with the ‹ › controls
 * (which move the selection by a week) keeps the selection on screen instead of
 * scrolling it off.
 */
export function dateStrip(
  selectedDate: string,
  now: Date,
  timezone: string,
): StripDay[] {
  const today = todayInZone(now, timezone);
  const horizon = lastBookableDate(now, timezone);

  const anchor = DateTime.fromISO(selectedDate, { zone: timezone });
  if (!anchor.isValid) {
    throw new Error(
      `dateStrip: invalid date "${selectedDate}" for timezone "${timezone}"`,
    );
  }

  const days: StripDay[] = [];

  for (let offset = 0; offset < STRIP_LENGTH; offset += 1) {
    // Calendar arithmetic, not `+ 86400000` — on a DST day a local day is 23 or
    // 25 hours long, and adding fixed milliseconds would repeat or skip one.
    const date = anchor.plus({ days: offset }).toISODate();
    if (!date) continue;

    days.push({
      date,
      isToday: date === today,
      bookable: date >= today && date <= horizon,
    });
  }

  return days;
}

/**
 * Whether the strip can page backwards without leaving the bookable window
 * entirely — the ‹ control is disabled on the week containing today.
 */
export function canPageBack(
  selectedDate: string,
  now: Date,
  timezone: string,
): boolean {
  return selectedDate > todayInZone(now, timezone);
}

export function canPageForward(
  selectedDate: string,
  now: Date,
  timezone: string,
): boolean {
  return selectedDate < lastBookableDate(now, timezone);
}

/**
 * Shifts the selection by whole weeks, clamped to the bookable window, so the
 * ‹ › controls can never land on an unbookable day.
 */
export function shiftByWeek(
  selectedDate: string,
  weeks: number,
  now: Date,
  timezone: string,
): string {
  const anchor = DateTime.fromISO(selectedDate, { zone: timezone });
  if (!anchor.isValid) return todayInZone(now, timezone);

  const shifted = anchor.plus({ weeks }).toISODate();
  return resolveBookingDate(shifted ?? undefined, now, timezone);
}

/**
 * The tenant-local calendar day containing `now`.
 *
 * The one definition of "today" for the whole app: the booking flow, the
 * dashboard overview and the calendar all call this, so they cannot disagree
 * about which day it is at the shop.
 */
export function todayInZone(now: Date, timezone: string): string {
  const local = DateTime.fromJSDate(now).setZone(timezone);
  if (!local.isValid) {
    throw new Error(`todayInZone: invalid timezone "${timezone}"`);
  }

  // toISODate() only returns null for an invalid DateTime, already ruled out.
  return local.toISODate() as string;
}

function lastBookableDate(now: Date, timezone: string): string {
  const local = DateTime.fromJSDate(now).setZone(timezone);
  if (!local.isValid) {
    throw new Error(`lastBookableDate: invalid timezone "${timezone}"`);
  }

  return local.plus({ days: BOOKING_HORIZON_DAYS }).toISODate() as string;
}
