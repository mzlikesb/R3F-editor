/**
 * Repair combo (plan 008 C.2, R7): repairs I made or helped with, each within `COMBO_WINDOW_MS` of
 * the previous one, count up as `x2`, `x3` next to the repair toast. Client display only; the server,
 * the HUD repair count and storage never see it. It lives in memory, so a reconnect keeps it and only
 * the time window decides.
 */
import type { RepairOutcome } from './feedback';

/** The next repair of mine must land within this long after the previous one (ms) to continue the run. */
export const COMBO_WINDOW_MS = 15_000;

export interface Combo {
  /** Repairs in the current run; 0 before the first one. */
  count: number;
  /** `performance.now()` of the latest repair in the run. */
  lastAt: number;
}

export const initialCombo: Combo = { count: 0, lastAt: Number.NEGATIVE_INFINITY };

/** A repair this player gets the feel for: theirs (`mine`) or one they helped with (`helped`). */
export function countsForMe(outcome: RepairOutcome): boolean {
  return outcome === 'mine' || outcome === 'helped';
}

/**
 * A repair of mine (or helped) within the window of the previous one adds one; outside it starts
 * over at 1. Someone else's repair returns `prev` itself: neither the count nor the window moves.
 */
export function nextCombo(prev: Combo, event: { outcome: RepairOutcome; now: number }): Combo {
  if (!countsForMe(event.outcome)) return prev;
  const within = prev.count > 0 && event.now - prev.lastAt <= COMBO_WINDOW_MS;
  return { count: within ? prev.count + 1 : 1, lastAt: event.now };
}

/** `x2` and up; a single repair shows nothing. */
export function comboLabel(count: number): string | null {
  return count >= 2 ? `x${count}` : null;
}
