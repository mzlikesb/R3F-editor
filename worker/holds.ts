/**
 * Who is holding the repair button right now (plan 006 A.10, neon (b)). Pure; `BaseRoom` keeps
 * each socket's hold in its attachment (it survives hibernation) and never stores it. Track
 * `server` implements the TODO bodies; the dev lead owns the signatures and `holds.test.ts`.
 */
import type { Fault } from '../shared/protocol';

/** A hold not released by then is dropped by the alarm (hold 1 s + slack for the answer). */
export const HOLD_EXPIRY_MS = 3000;

export interface Hold {
  faultId: string;
  /** Server time the `hold` arrived. */
  startedAt: number;
}

/**
 * A `hold{faultId}` arrived (and passed the rate limit; a limited `hold` never gets here).
 * Returns `current` itself when `faultId` is not in `faults` (holds for unknown faults are ignored).
 * Otherwise a new hold that replaces `current` (one hold per socket).
 */
export function startHold(current: Hold | null, faultId: string, now: number, faults: readonly Fault[]): Hold | null {
  void current;
  void faultId;
  void now;
  void faults;
  throw new Error('TODO(server): startHold');
}

/**
 * Ends the hold on `faultId`: null when `current` holds it, else `current` itself. Used for
 * `release{faultId}` and, on every socket, when `faultId` was repaired.
 */
export function releaseHold(current: Hold | null, faultId: string): Hold | null {
  void current;
  void faultId;
  throw new Error('TODO(server): releaseHold');
}

/** True once `HOLD_EXPIRY_MS` have passed since `startedAt`. */
export function isExpired(hold: Hold, now: number): boolean {
  void hold;
  void now;
  throw new Error('TODO(server): isExpired');
}

/** The earliest `startedAt + HOLD_EXPIRY_MS` among the holds; null when there are none. */
export function earliestExpiry(holds: readonly (Hold | null)[]): number | null {
  void holds;
  throw new Error('TODO(server): earliestExpiry');
}

/**
 * The `activity.holds` for one receiver: holds per fault across `holds` (every open socket,
 * the receiver included), minus the receiver's own hold `own`. Only counts >= 1 appear.
 */
export function activityFor(holds: readonly (Hold | null)[], own: Hold | null): Record<string, number> {
  void holds;
  void own;
  throw new Error('TODO(server): activityFor');
}
