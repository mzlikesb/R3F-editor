import { describe, expect, it } from 'vitest';
import {
  BLINK,
  HOVER,
  LIGHT_HEIGHT,
  LIGHT_RADIUS,
  MAX_PRESENCE_LIGHTS,
  presenceBlink,
  presenceHover,
  presenceLightAt,
  presenceLightCount,
  presenceLights,
  stepLightScale,
} from './presenceLightPath';

describe('presenceLightCount', () => {
  it('counts the others: this player is not a light', () => {
    expect(presenceLightCount(0)).toBe(0);
    expect(presenceLightCount(1)).toBe(0);
    expect(presenceLightCount(2)).toBe(1);
    expect(presenceLightCount(5)).toBe(4);
  });

  it('stops at the cap', () => {
    expect(presenceLightCount(MAX_PRESENCE_LIGHTS + 1)).toBe(MAX_PRESENCE_LIGHTS);
    expect(presenceLightCount(500)).toBe(MAX_PRESENCE_LIGHTS);
  });

  it('never goes negative', () => {
    expect(presenceLightCount(-3)).toBe(0);
  });
});

describe('presenceLights', () => {
  it('returns as many positions as lights, capped', () => {
    expect(presenceLights(0, 0)).toHaveLength(0);
    expect(presenceLights(1, 0)).toHaveLength(1);
    expect(presenceLights(100, 0)).toHaveLength(MAX_PRESENCE_LIGHTS);
  });

  it('is deterministic: the same index and time give the same place on every screen', () => {
    expect(presenceLights(5, 123.4)).toEqual(presenceLights(5, 123.4));
  });

  it('keeps the first lights where they are as more people arrive', () => {
    expect(presenceLights(6, 40).slice(0, 3)).toEqual(presenceLights(3, 40));
  });

  it('moves slowly', () => {
    const [a] = presenceLights(1, 10);
    const [b] = presenceLights(1, 11);
    expect(Math.hypot(b!.x - a!.x, b!.y - a!.y, b!.z - a!.z)).toBeLessThan(1.5);
    expect(Math.hypot(b!.x - a!.x, b!.z - a!.z)).toBeGreaterThan(0);
  });

  it('spreads the lights apart', () => {
    const ps = presenceLights(MAX_PRESENCE_LIGHTS, 0);
    for (let i = 0; i < ps.length; i++) {
      for (let j = i + 1; j < ps.length; j++) {
        expect(Math.hypot(ps[i]!.x - ps[j]!.x, ps[i]!.z - ps[j]!.z)).toBeGreaterThan(0.5);
      }
    }
  });

  it('stays over the base, inside its radius and height range, at any time', () => {
    for (let t = 0; t < 3000; t += 7.3) {
      for (const p of presenceLights(MAX_PRESENCE_LIGHTS, t)) {
        const r = Math.hypot(p.x, p.z);
        expect(r).toBeGreaterThanOrEqual(LIGHT_RADIUS.min - 1e-9);
        expect(r).toBeLessThanOrEqual(LIGHT_RADIUS.max + 1e-9);
        expect(p.y).toBeGreaterThanOrEqual(LIGHT_HEIGHT.min - 1e-9);
        expect(p.y).toBeLessThanOrEqual(LIGHT_HEIGHT.max + 1e-9);
      }
    }
  });

  it('writes into the object it is given (no allocation per frame)', () => {
    const out = { x: 0, y: 0, z: 0 };
    expect(presenceLightAt(2, 5, out)).toBe(out);
    expect(out).toEqual(presenceLights(3, 5)[2]);
  });
});

describe('stepLightScale', () => {
  it('grows toward 1 and shrinks toward 0 without jumping', () => {
    const grown = stepLightScale(0, true, 1 / 60);
    expect(grown).toBeGreaterThan(0);
    expect(grown).toBeLessThan(0.2);
    const shrunk = stepLightScale(1, false, 1 / 60);
    expect(shrunk).toBeLessThan(1);
    expect(shrunk).toBeGreaterThan(0.8);
  });

  it('settles on 0 when gone and reaches 1 when present', () => {
    let s = 1;
    for (let i = 0; i < 600; i++) s = stepLightScale(s, false, 1 / 60);
    expect(s).toBe(0);
    for (let i = 0; i < 600; i++) s = stepLightScale(s, true, 1 / 60);
    expect(s).toBeCloseTo(1, 3);
  });
});

describe('presenceBlink (#108)', () => {
  it('stays between 0.6 and 1 and reaches both ends', () => {
    let lo = 1;
    let hi = 0;
    for (let t = 0; t < BLINK.periodS; t += 0.01) {
      const b = presenceBlink(0, t);
      expect(b).toBeGreaterThanOrEqual(BLINK.min);
      expect(b).toBeLessThanOrEqual(BLINK.max);
      lo = Math.min(lo, b);
      hi = Math.max(hi, b);
    }
    expect(lo).toBeCloseTo(BLINK.min, 2);
    expect(hi).toBeCloseTo(BLINK.max, 2);
  });

  it('is slow (a cycle of seconds) and drones are not in step', () => {
    expect(BLINK.periodS).toBeGreaterThanOrEqual(2);
    expect(presenceBlink(0, 1)).not.toBeCloseTo(presenceBlink(1, 1), 2);
  });
});

describe('presenceHover (#108: a drone floats, a pebble does not)', () => {
  it('bobs 0.15-0.25 m, each drone on its own phase', () => {
    expect(HOVER.amplitude).toBeGreaterThanOrEqual(0.15);
    expect(HOVER.amplitude).toBeLessThanOrEqual(0.25);
    let lo = 0;
    let hi = 0;
    for (let t = 0; t < HOVER.periodS; t += 0.01) {
      const y = presenceHover(0, t);
      lo = Math.min(lo, y);
      hi = Math.max(hi, y);
    }
    expect(hi).toBeCloseTo(HOVER.amplitude, 2);
    expect(lo).toBeCloseTo(-HOVER.amplitude, 2);
    expect(presenceHover(0, 0.7)).not.toBeCloseTo(presenceHover(1, 0.7), 2);
  });
});
