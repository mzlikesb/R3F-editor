import { describe, expect, it } from 'vitest';
import type { Fault } from '../shared/protocol';
import { HOLD_EXPIRY_MS, activityFor, earliestExpiry, isExpired, releaseHold, startHold, type Hold } from './holds';

const faults: Fault[] = [
  { id: 'f1', moduleId: 'oxygen', createdAt: 0 },
  { id: 'f2', moduleId: 'generator', createdAt: 0 },
];
const h = (faultId: string, startedAt = 1000): Hold => ({ faultId, startedAt });

describe('startHold', () => {
  it('starts a hold on a current fault', () => {
    expect(startHold(null, 'f1', 500, faults)).toEqual({ faultId: 'f1', startedAt: 500 });
  });

  it('ignores a hold for a fault that is not there', () => {
    expect(startHold(null, 'gone', 500, faults)).toBeNull();
    const current = h('f1');
    expect(startHold(current, 'gone', 500, faults)).toBe(current);
  });

  it("replaces the socket's previous hold (one hold per socket)", () => {
    expect(startHold(h('f1'), 'f2', 2000, faults)).toEqual({ faultId: 'f2', startedAt: 2000 });
  });
});

describe('releaseHold', () => {
  it('clears the hold on that fault only', () => {
    expect(releaseHold(h('f1'), 'f1')).toBeNull();
    const other = h('f2');
    expect(releaseHold(other, 'f1')).toBe(other);
    expect(releaseHold(null, 'f1')).toBeNull();
  });
});

describe('expiry', () => {
  it('expires 3 seconds after the hold started', () => {
    expect(HOLD_EXPIRY_MS).toBe(3000);
    expect(isExpired(h('f1', 1000), 3999)).toBe(false);
    expect(isExpired(h('f1', 1000), 4000)).toBe(true);
  });

  it('plans the alarm at the earliest expiry', () => {
    expect(earliestExpiry([h('f1', 5000), null, h('f2', 2000)])).toBe(5000);
    expect(earliestExpiry([null, null])).toBeNull();
    expect(earliestExpiry([])).toBeNull();
  });
});

describe("activityFor (neon (b): the server leaves out the receiver's own hold)", () => {
  const a = h('f1');
  const b = h('f1');
  const c = h('f2');
  const all = [a, b, c, null];

  it("counts every other socket's hold per fault", () => {
    expect(activityFor(all, null)).toEqual({ f1: 2, f2: 1 });
    expect(activityFor(all, a)).toEqual({ f1: 1, f2: 1 });
    expect(activityFor(all, c)).toEqual({ f1: 2 });
  });

  it('holding alone shows nobody else, so my own release can never flash "someone is repairing"', () => {
    expect(activityFor([a, null], a)).toEqual({});
  });

  it('drops a fault once its last holder lets go, closes, or the fault is repaired', () => {
    // b released / its socket closed:
    expect(activityFor([a, c], c)).toEqual({ f1: 1 });
    // f1 repaired: every socket's hold on it is cleared.
    const cleared = all.map((x) => releaseHold(x, 'f1'));
    expect(activityFor(cleared, null)).toEqual({ f2: 1 });
    expect(activityFor(cleared, c)).toEqual({});
  });
});
