import { describe, expect, it } from 'vitest';
import { GOTO_LOCK_MS, NO_LOCK, goToLocked, stepGoToLock } from './goToLock';

describe('go-to button lock', () => {
  it('a first target is not locked', () => {
    const lock = stepGoToLock(NO_LOCK, 'habitat', 'greenhouse', 1000);
    expect(goToLocked(lock, 1000)).toBe(false);
  });

  it('a target that appears or goes away does not lock', () => {
    let lock = stepGoToLock(NO_LOCK, 'habitat', null, 0);
    lock = stepGoToLock(lock, 'habitat', 'greenhouse', 100);
    expect(goToLocked(lock, 100)).toBe(false);
    lock = stepGoToLock(lock, 'habitat', null, 200);
    expect(goToLocked(lock, 200)).toBe(false);
  });

  it('a target that turns into another module ignores taps for 0.6 s', () => {
    let lock = stepGoToLock(NO_LOCK, 'habitat', 'greenhouse', 0);
    lock = stepGoToLock(lock, 'habitat', 'comms', 1000);
    expect(goToLocked(lock, 1000)).toBe(true);
    expect(goToLocked(lock, 1000 + GOTO_LOCK_MS - 1)).toBe(true);
    expect(goToLocked(lock, 1000 + GOTO_LOCK_MS)).toBe(false);
  });

  it('the same target seen again keeps the lock as it was', () => {
    let lock = stepGoToLock(NO_LOCK, 'habitat', 'greenhouse', 0);
    lock = stepGoToLock(lock, 'habitat', 'comms', 1000);
    lock = stepGoToLock(lock, 'habitat', 'comms', 1200);
    expect(lock.lockedUntil).toBe(1000 + GOTO_LOCK_MS);
  });

  it('switching to another panel starts fresh', () => {
    let lock = stepGoToLock(NO_LOCK, 'habitat', 'greenhouse', 0);
    lock = stepGoToLock(lock, 'habitat', 'comms', 1000);
    lock = stepGoToLock(lock, 'generator', 'oxygen', 1100);
    expect(goToLocked(lock, 1100)).toBe(false);
  });
});
