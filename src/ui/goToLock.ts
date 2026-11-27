/**
 * The panel's `눌러서 이동` button leads to the oldest fault, which can change under the finger
 * (someone repairs it, so the button turns into another module and the tap goes there: #80). When
 * the target changes from one module to another, the button ignores taps for a moment so the
 * player sees the new label first. Pure; `Panel` drives it.
 */
import type { ModuleId } from '../../shared/protocol';

export const GOTO_LOCK_MS = 600;

export interface GoToLock {
  /** Module the button led to last time, and for which panel (a new panel starts fresh). */
  selected: ModuleId | null;
  target: ModuleId | null;
  /** Taps are ignored until this time (ms, same clock as `now`). */
  lockedUntil: number;
}

export const NO_LOCK: GoToLock = { selected: null, target: null, lockedUntil: 0 };

/** The lock after seeing `target` in the panel of `selected` at `now`. */
export function stepGoToLock(prev: GoToLock, selected: ModuleId, target: ModuleId | null, now: number): GoToLock {
  if (prev.selected !== selected) return { selected, target, lockedUntil: 0 };
  if (prev.target !== null && target !== null && prev.target !== target) {
    return { selected, target, lockedUntil: now + GOTO_LOCK_MS };
  }
  return { ...prev, target };
}

export function goToLocked(lock: GoToLock, now: number): boolean {
  return now < lock.lockedUntil;
}
