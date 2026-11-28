import { describe, expect, it } from 'vitest';
import type { RepairEffect, RepairOutcome } from '../feedback';
import {
  SHAKE_AMPLITUDE,
  SHAKE_MS,
  SHAKE_REF_DISTANCE,
  ShakeDriver,
  shakeAmplitude,
  shakeOffset,
  shouldShake,
  type Vec3,
} from './shake';

const v = (): Vec3 => ({ x: 0, y: 0, z: 0 });
const len = (p: Vec3) => Math.hypot(p.x, p.y, p.z);

describe('shakeOffset', () => {
  it('starts at 0', () => {
    expect(len(shakeOffset(0, v()))).toBe(0);
  });

  it('is 0 once the shake is over, and before it starts', () => {
    expect(len(shakeOffset(SHAKE_MS, v()))).toBe(0);
    expect(len(shakeOffset(SHAKE_MS + 500, v()))).toBe(0);
    expect(len(shakeOffset(-1, v()))).toBe(0);
  });

  it('never goes past the largest amplitude, and does move in between', () => {
    let peak = 0;
    for (let t = 0; t <= SHAKE_MS; t += 1) peak = Math.max(peak, len(shakeOffset(t, v())));
    expect(peak).toBeLessThanOrEqual(SHAKE_AMPLITUDE);
    expect(peak).toBeGreaterThan(SHAKE_AMPLITUDE * 0.3);
  });

  it('lasts about a quarter second', () => {
    expect(SHAKE_MS).toBeGreaterThanOrEqual(200);
    expect(SHAKE_MS).toBeLessThanOrEqual(300);
  });

  it('writes into the vector it is given (no allocation per frame)', () => {
    const out = v();
    expect(shakeOffset(50, out)).toBe(out);
  });
});

describe('shake amplitude follows the camera distance', () => {
  const peakAt = (distance: number) => {
    let peak = 0;
    for (let t = 0; t <= SHAKE_MS; t += 1) peak = Math.max(peak, len(shakeOffset(t, v(), distance)));
    return peak;
  };

  it('is SHAKE_AMPLITUDE (0.12) at the reference distance 23', () => {
    expect(SHAKE_REF_DISTANCE).toBe(23);
    expect(shakeAmplitude(23)).toBeCloseTo(0.12, 12);
  });

  it('shrinks in proportion when the camera is closer', () => {
    expect(shakeAmplitude(11.5)).toBeCloseTo(0.06, 12);
    expect(shakeAmplitude(4.6)).toBeCloseTo(0.024, 12);
    expect(peakAt(11.5)).toBeLessThanOrEqual(shakeAmplitude(11.5));
    expect(peakAt(11.5)).toBeLessThan(peakAt(23));
    expect(peakAt(23) / peakAt(11.5)).toBeCloseTo(2, 6);
  });

  it('is capped far away and falls back to the reference on a bad distance', () => {
    expect(shakeAmplitude(1000)).toBeCloseTo(SHAKE_AMPLITUDE * 2, 12);
    expect(shakeAmplitude(0)).toBe(SHAKE_AMPLITUDE);
    expect(shakeAmplitude(Number.NaN)).toBe(SHAKE_AMPLITUDE);
  });

  it('defaults to the reference distance', () => {
    expect(shakeOffset(60, v())).toEqual(shakeOffset(60, v(), SHAKE_REF_DISTANCE));
  });
});

describe('shouldShake', () => {
  const fx = (outcome: RepairOutcome, seq: number): RepairEffect => ({
    outcome,
    moduleId: 'oxygen',
    seq,
    at: seq * 100,
  });

  it('a new repair I made or helped with shakes (008 R7)', () => {
    expect(shouldShake(null, fx('mine', 1))).toBe(true);
    expect(shouldShake(fx('other', 1), fx('mine', 2))).toBe(true);
    expect(shouldShake(fx('mine', 1), fx('helped', 2))).toBe(true);
  });

  it('someone else’s repair alone does not', () => {
    expect(shouldShake(null, fx('other', 1))).toBe(false);
    expect(shouldShake(fx('mine', 1), fx('beaten', 2))).toBe(false);
  });

  it('an update that left the effect alone (snapshot, fault, tick) does not', () => {
    const e = fx('mine', 3);
    expect(shouldShake(e, e)).toBe(false);
    expect(shouldShake(e, { ...e })).toBe(false);
    expect(shouldShake(null, null)).toBe(false);
  });
});

/**
 * One frame the way R3F runs it: shake undo at -2, CameraControls at -1, shake apply at 0, then
 * the render reads `pos`. `controls` stands in for CameraControls; the worst case reads the camera
 * position it is handed, so any offset left on it would leak into the next frame.
 */
type Controls = (pos: Vec3, frame: number) => void;

/** Eases the camera toward a goal from wherever it is (reads the position). */
const easing: Controls = (pos, frame) => {
  const goal = { x: 3, y: 12 - frame * 0.01, z: 18 };
  pos.x += (goal.x - pos.x) * 0.2;
  pos.y += (goal.y - pos.y) * 0.2;
  pos.z += (goal.z - pos.z) * 0.2;
};
/** Leaves the camera alone (CameraControls at rest does not write the camera). */
const still: Controls = () => {};

const FRAME_MS = 16;

function simulate(
  controls: Controls,
  frames: number,
  opts: { shakeAt?: number[]; unmountAt?: number } = {},
): { pos: Vec3; rendered: Vec3[] } {
  const pos = { x: 0, y: 13, z: 19 };
  const rendered: Vec3[] = [];
  let driver: ShakeDriver | null = opts.shakeAt ? new ShakeDriver() : null;
  for (let f = 0; f < frames; f++) {
    const now = f * FRAME_MS;
    if (driver && opts.unmountAt === f) {
      driver.reset(pos);
      driver = null;
    }
    if (driver && opts.shakeAt?.includes(f)) driver.start(now);
    driver?.undo(pos);
    controls(pos, f);
    driver?.apply(pos, now);
    rendered.push({ ...pos });
  }
  return { pos, rendered };
}

describe('ShakeDriver', () => {
  for (const [name, controls] of [
    ['easing controls', easing],
    ['still controls', still],
  ] as const) {
    it(`${name}: after the shake the camera is exactly where it would be without one`, () => {
      const base = simulate(controls, 60);
      const shaken = simulate(controls, 60, { shakeAt: [5, 9] });
      expect(shaken.pos.x).toBeCloseTo(base.pos.x, 9);
      expect(shaken.pos.y).toBeCloseTo(base.pos.y, 9);
      expect(shaken.pos.z).toBeCloseTo(base.pos.z, 9);
      // ...and it did shake in between.
      const moved = shaken.rendered.some((p, i) => {
        const b = base.rendered[i];
        return b !== undefined && len({ x: p.x - b.x, y: p.y - b.y, z: p.z - b.z }) > 1e-4;
      });
      expect(moved).toBe(true);
    });

    it(`${name}: unmounting mid-shake takes the offset back at once`, () => {
      const base = simulate(controls, 40);
      const cut = simulate(controls, 40, { shakeAt: [5], unmountAt: 8 });
      const [c8, b8] = [cut.rendered[8], base.rendered[8]];
      if (!c8 || !b8) throw new Error('frame 8 missing');
      expect(c8.x).toBeCloseTo(b8.x, 9);
      expect(c8.y).toBeCloseTo(b8.y, 9);
      expect(c8.z).toBeCloseTo(b8.z, 9);
      expect(cut.pos.x).toBeCloseTo(base.pos.x, 9);
      expect(cut.pos.y).toBeCloseTo(base.pos.y, 9);
      expect(cut.pos.z).toBeCloseTo(base.pos.z, 9);
    });
  }

  it('reset with nothing applied leaves the camera alone, and twice is harmless', () => {
    const d = new ShakeDriver();
    const pos = { x: 1, y: 2, z: 3 };
    d.reset(pos);
    d.start(0);
    d.undo(pos);
    d.apply(pos, 40);
    d.reset(pos);
    d.reset(pos);
    expect(pos.x).toBeCloseTo(1, 12);
    expect(pos.y).toBeCloseTo(2, 12);
    expect(pos.z).toBeCloseTo(3, 12);
  });

  it('apply passes the distance through: a close camera moves less', () => {
    const far = { x: 0, y: 0, z: 0 };
    const near = { x: 0, y: 0, z: 0 };
    const a = new ShakeDriver();
    const b = new ShakeDriver();
    a.start(0);
    b.start(0);
    a.apply(far, 40, 23);
    b.apply(near, 40, 11.5);
    expect(len(near)).toBeGreaterThan(0);
    expect(len(far) / len(near)).toBeCloseTo(2, 9);
  });

  it('a reset stops the shake: later frames add nothing', () => {
    const d = new ShakeDriver();
    const pos = { x: 0, y: 0, z: 0 };
    d.start(0);
    d.apply(pos, 40);
    d.reset(pos);
    d.undo(pos);
    d.apply(pos, 60);
    expect(len(pos)).toBe(0);
  });
});
