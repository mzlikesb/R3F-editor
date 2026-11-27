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
  if (!faults.some((f) => f.id === faultId)) return current;
  return { faultId, startedAt: now };
}

/**
 * Ends the hold on `faultId`: null when `current` holds it, else `current` itself. Used for
 * `release{faultId}` and, on every socket, when `faultId` was repaired.
 */
export function releaseHold(current: Hold | null, faultId: string): Hold | null {
  return current !== null && current.faultId === faultId ? null : current;
}

/** True once `HOLD_EXPIRY_MS` have passed since `startedAt`. */
export function isExpired(hold: Hold, now: number): boolean {
  return now - hold.startedAt >= HOLD_EXPIRY_MS;
}

/** The earliest `startedAt + HOLD_EXPIRY_MS` among the holds; null when there are none. */
export function earliestExpiry(holds: readonly (Hold | null)[]): number | null {
  let earliest: number | null = null;
  for (const hold of holds) {
    if (hold === null) continue;
    const at = hold.startedAt + HOLD_EXPIRY_MS;
    if (earliest === null || at < earliest) earliest = at;
  }
  return earliest;
}

/**
 * The `activity.holds` for one receiver: holds per fault across `holds` (every open socket,
 * the receiver included), minus the receiver's own hold `own`. Only counts >= 1 appear.
 */
export function activityFor(holds: readonly (Hold | null)[], own: Hold | null): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const hold of holds) {
    if (hold !== null) counts[hold.faultId] = (counts[hold.faultId] ?? 0) + 1;
  }
  // `own` may be a copy read back from an attachment, so subtract it by value, not by identity.
  if (own !== null && counts[own.faultId] !== undefined) counts[own.faultId]! -= 1;
  for (const faultId of Object.keys(counts)) {
    if (counts[faultId]! <= 0) delete counts[faultId];
  }
  return counts;
}

/**
 * Whether a socket helped repair `faultId` at `now` (#56): a protocol-2 socket whose hold on it has
 * not expired, even if the alarm has not dropped it yet. `BaseRoom` leaves out the requester and
 * asks before it releases the holds on `faultId`. Protocol-1 tabs keep their old `repaired`.
 */
export function helps(socket: { protocol: 1 | 2; hold: Hold | null }, faultId: string, now: number): boolean {
  const { hold } = socket;
  return socket.protocol === 2 && hold !== null && hold.faultId === faultId && !isExpired(hold, now);
}
