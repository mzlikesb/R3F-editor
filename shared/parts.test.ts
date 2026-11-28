import { describe, expect, it } from 'vitest';
import {
  PARTS_CAP,
  PART_EARLY_MS,
  PART_SLOT_MS,
  PART_SPOTS,
  PART_Y,
  clampParts,
  partPosition,
  partSlot,
} from './parts';

const T = 1_800_000_000_000;

describe('constants (plan 009 A.1, A.2, R5)', () => {
  it('match the plan', () => {
    expect(PART_SLOT_MS).toBe(10_000);
    expect(PARTS_CAP).toBe(5);
    expect(PART_EARLY_MS).toBe(1_000);
  });
});

describe('partSlot', () => {
  it('is the 10 s slot the time falls in', () => {
    expect(partSlot(0)).toBe(0);
    expect(partSlot(9_999)).toBe(0);
    expect(partSlot(10_000)).toBe(1);
    expect(partSlot(T)).toBe(T / PART_SLOT_MS);
    expect(partSlot(T + PART_SLOT_MS - 1)).toBe(T / PART_SLOT_MS);
  });
});

describe('partPosition', () => {
  const slots = Array.from({ length: 2000 }, (_, i) => partSlot(T) + i);

  it('is deterministic', () => {
    for (const s of slots.slice(0, 50)) expect(partPosition(s)).toEqual(partPosition(s));
  });

  it('floats at PART_Y on a known spot, inside the module bounds', () => {
    const spots = new Set(PART_SPOTS.map(([x, z]) => `${x},${z}`));
    for (const s of slots) {
      const p = partPosition(s);
      expect(p.y).toBe(PART_Y);
      expect(spots.has(`${p.x},${p.z}`)).toBe(true);
      expect(Math.abs(p.x)).toBeLessThanOrEqual(14);
      expect(Math.abs(p.z)).toBeLessThanOrEqual(14);
    }
  });

  it('two slots in a row are never close', () => {
    for (const s of slots) {
      const a = partPosition(s);
      const b = partPosition(s + 1);
      expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThanOrEqual(5);
    }
  });

  it('uses many spots, not a few', () => {
    const used = new Set(slots.map((s) => JSON.stringify(partPosition(s))));
    expect(used.size).toBeGreaterThanOrEqual(PART_SPOTS.length * 0.8);
  });
});

describe('clampParts', () => {
  it('cuts an integer to 0..PARTS_CAP and rejects anything else', () => {
    expect([-3, 0, 3, 5, 6, 99].map(clampParts)).toEqual([0, 0, 3, 5, 5, 5]);
    for (const v of [1.5, '2', null, undefined, Number.NaN]) expect(clampParts(v)).toBeNull();
  });
});
