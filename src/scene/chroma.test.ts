import { describe, expect, it } from 'vitest';
import { CHROMA_PEAK, CHROMA_S, chromaAmount, chromaPulse } from './chroma';

/** Chromatic aberration pulse (008 C.3, R6): only a blackout seen starting live. */
describe('chromaPulse', () => {
  it('fires on a live normal -> blackout transition', () => {
    expect(chromaPulse(false, true, 'live')).toBe(true);
  });

  it('does not fire when a snapshot (join or reconnect) brings the blackout', () => {
    expect(chromaPulse(false, true, 'snapshot')).toBe(false);
  });

  it('normal, then cut off, then reconnected into a blackout: the reconnect snapshot does not fire', () => {
    // Disconnecting leaves the base as it was (normal); the reconnect snapshot carries the blackout.
    let blackout = false;
    const fired: boolean[] = [];
    for (const [next, source] of [
      [false, 'live'],
      [true, 'snapshot'],
      [true, 'live'], // a later fault while already dark
    ] as const) {
      fired.push(chromaPulse(blackout, next, source));
      blackout = next;
    }
    expect(fired).toEqual([false, false, false]);
  });

  it('does not fire while it stays dark, when it ends, or when nothing changed', () => {
    expect(chromaPulse(true, true, 'live')).toBe(false);
    expect(chromaPulse(true, false, 'live')).toBe(false);
    expect(chromaPulse(false, false, 'live')).toBe(false);
  });
});

describe('chromaAmount', () => {
  it('lasts 0.4 s', () => {
    expect(CHROMA_S).toBe(0.4);
  });

  it('hits at full strength and fades to 0, never above the peak', () => {
    expect(chromaAmount(0)).toBe(CHROMA_PEAK);
    expect(chromaAmount(CHROMA_S)).toBe(0);
    expect(chromaAmount(CHROMA_S + 1)).toBe(0);
    let prev = CHROMA_PEAK;
    for (let t = 0; t <= CHROMA_S; t += 0.01) {
      const a = chromaAmount(t);
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThanOrEqual(prev);
      prev = a;
    }
  });

  it('is 0 before a pulse ever happened (negative elapsed)', () => {
    expect(chromaAmount(-1)).toBe(0);
    expect(chromaAmount(Number.POSITIVE_INFINITY)).toBe(0);
  });
});
