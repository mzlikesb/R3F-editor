import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CLOCK_TICK_MS, clockNow, subscribeClock } from './clock';

describe('shared clock (#80: HUD 18초 vs record card 17초)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('gives every subscriber the same time on a tick, even one that joined mid-second', () => {
    vi.setSystemTime(1_000);
    const a: number[] = [];
    const b: number[] = [];
    const offA = subscribeClock((n) => a.push(n));
    vi.advanceTimersByTime(400);
    const offB = subscribeClock((n) => b.push(n));
    // B joins between ticks and is given the last tick's time, not its own Date.now().
    expect(b).toEqual([1_000]);
    vi.advanceTimersByTime(CLOCK_TICK_MS);
    expect(a.at(-1)).toBe(b.at(-1));
    expect(clockNow()).toBe(a.at(-1));
    offA();
    offB();
  });

  it('stops ticking when the last subscriber leaves', () => {
    const fn = vi.fn();
    const off = subscribeClock(fn);
    off();
    fn.mockClear();
    vi.advanceTimersByTime(CLOCK_TICK_MS * 3);
    expect(fn).not.toHaveBeenCalled();
    vi.setSystemTime(99_000);
    expect(clockNow()).toBe(99_000);
  });
});
