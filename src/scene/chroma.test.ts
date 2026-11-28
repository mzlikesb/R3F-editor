import { describe, expect, it } from 'vitest';
import { initialFeedback } from '../feedback';
import { initialRepairUi } from '../hold';
import { setClientSender, useStore } from '../store';
import { initialSync } from '../sync';
import {
  CHROMA_PEAK,
  CHROMA_S,
  CHROMA_SLOW_S,
  chromaAmount,
  chromaDebug,
  chromaOffsetAt,
  chromaPulse,
  triggerChromaDebug,
} from './chroma';

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

describe('the ?perf "blackout effect" debug trigger (#108)', () => {
  it('fires a pulse on this client only: no message to the server, the store untouched', () => {
    useStore.setState({ sync: initialSync, repair: initialRepairUi, feedback: initialFeedback, blackoutLiveAt: null });
    const sent: unknown[] = [];
    setClientSender((m) => sent.push(m));
    const before = useStore.getState();
    chromaDebug.slow = false;
    triggerChromaDebug(1000);
    expect(chromaOffsetAt(1010, null)).toBeGreaterThan(0);
    expect(sent).toEqual([]);
    expect(useStore.getState()).toBe(before);
    setClientSender(null);
  });

  it('"slow" stretches the pulse from 0.4 s to 2 s', () => {
    expect(CHROMA_SLOW_S).toBe(2);
    chromaDebug.slow = false;
    triggerChromaDebug(0);
    expect(chromaOffsetAt(1000, null)).toBe(0);
    chromaDebug.slow = true;
    expect(chromaOffsetAt(1000, null)).toBeGreaterThan(0);
    expect(chromaOffsetAt(2000, null)).toBe(0);
    chromaDebug.slow = false;
  });

  it('a live blackout start still pulses on its own, at 0.4 s', () => {
    chromaDebug.at = null;
    expect(chromaOffsetAt(5000, 5000)).toBe(CHROMA_PEAK);
    expect(chromaOffsetAt(5000 + CHROMA_S * 1000, 5000)).toBe(0);
  });

  it('chromaAmount takes a duration', () => {
    expect(chromaAmount(1, CHROMA_SLOW_S)).toBeGreaterThan(0);
    expect(chromaAmount(1)).toBe(0);
  });
});
