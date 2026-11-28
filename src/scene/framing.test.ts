import { describe, expect, it } from 'vitest';
import { fitDistance, overviewFov, project, type FrameSpec } from './framing';
import { overviewPose } from './cameraPath';
import {
  FLOOR_RING_POINTS,
  LABEL_POINTS,
  OVERVIEW_BOTTOM_UI,
  OVERVIEW_DIR,
  OVERVIEW_MARGIN,
  OVERVIEW_POINTS,
  OVERVIEW_TARGET,
} from './layout';

function spec(width: number, height: number): FrameSpec {
  return {
    target: OVERVIEW_TARGET,
    dir: OVERVIEW_DIR,
    fovDeg: overviewFov(width / height),
    width,
    height,
    margin: { side: 12, top: 130, bottom: 70 },
  };
}

/** Pixel position of a world point for a camera `d` away along the spec's direction. */
function px(s: FrameSpec, d: number, p: { x: number; y: number; z: number }) {
  const n = project(s, d, p);
  return { x: ((n.x + 1) / 2) * s.width, y: ((1 - n.y) / 2) * s.height };
}

describe('overviewFov', () => {
  it('widens the view on a portrait screen', () => {
    expect(overviewFov(390 / 844)).toBeGreaterThan(overviewFov(1280 / 800));
    expect(overviewFov(1280 / 800)).toBe(50);
  });
});

describe('fitDistance', () => {
  for (const [w, h] of [
    [390, 844],
    [360, 740],
    [1280, 800],
    [844, 390],
  ] as const) {
    it(`keeps every module inside the free area at ${w}x${h}`, () => {
      const s = spec(w, h);
      const d = fitDistance(s, OVERVIEW_POINTS);
      for (const p of OVERVIEW_POINTS) {
        const q = px(s, d, p);
        expect(q.x).toBeGreaterThanOrEqual(s.margin.side - 0.5);
        expect(q.x).toBeLessThanOrEqual(w - s.margin.side + 0.5);
        expect(q.y).toBeGreaterThanOrEqual(s.margin.top - 0.5);
        expect(q.y).toBeLessThanOrEqual(h - s.margin.bottom + 0.5);
      }
    });

    it(`is tight at ${w}x${h}: a little closer and something leaves the free area`, () => {
      const s = spec(w, h);
      const d = fitDistance(s, OVERVIEW_POINTS) * 0.95;
      const out = OVERVIEW_POINTS.some((p) => {
        const q = px(s, d, p);
        return q.x < s.margin.side || q.x > w - s.margin.side || q.y < s.margin.top || q.y > h - s.margin.bottom;
      });
      expect(out).toBe(true);
    });
  }

  it('needs more distance on a phone held upright than on a desktop', () => {
    expect(fitDistance(spec(390, 844), OVERVIEW_POINTS)).toBeGreaterThan(fitDistance(spec(1280, 800), OVERVIEW_POINTS));
  });
});

describe('portrait overview (plan 008 A.2)', () => {
  /** Pixel position of `p` in the overview a fresh visit sees (azimuth `az`, default 0). */
  function screen(w: number, h: number, az = 0) {
    const pose = overviewPose(az, overviewFov(w / h), w, h);
    const s: FrameSpec = {
      target: OVERVIEW_TARGET,
      dir: pose.dir,
      fovDeg: pose.fov,
      width: w,
      height: h,
      margin: OVERVIEW_MARGIN,
      lift: pose.lift,
    };
    return (p: { x: number; y: number; z: number }) => px(s, pose.distance, p);
  }
  const lowest = (w: number, h: number, az = 0) =>
    Math.max(...[...OVERVIEW_POINTS, ...FLOOR_RING_POINTS].map((p) => screen(w, h, az)(p).y));

  for (const [w, h] of [
    [390, 844],
    [360, 780],
    [320, 568],
  ] as const) {
    it(`${w}x${h}: empty floor under the base is at most 20% of the screen`, () => {
      for (const az of [0, 1, 2.5, -2]) expect(h - lowest(w, h, az)).toBeLessThanOrEqual(0.2 * h);
    });

    it(`${w}x${h}: the lowest point, fault rings included, stays above the bottom UI`, () => {
      for (const az of [0, 1, 2.5, -2]) expect(h - lowest(w, h, az)).toBeGreaterThanOrEqual(OVERVIEW_BOTTOM_UI - 0.5);
    });

    it(`${w}x${h}: name tags and badges clear the HUD`, () => {
      const at = screen(w, h);
      for (const p of LABEL_POINTS) expect(at(p).y).toBeGreaterThanOrEqual(OVERVIEW_MARGIN.top - 0.5);
    });

    it(`${w}x${h}: every module stays on screen with a side margin`, () => {
      const at = screen(w, h);
      for (const p of OVERVIEW_POINTS) {
        expect(at(p).x).toBeGreaterThanOrEqual(0.04 * w);
        expect(at(p).x).toBeLessThanOrEqual(0.96 * w);
      }
    });
  }

  it('desktop overviews are unchanged (1280x800, 1920x1080, 2560x1080)', () => {
    // Fitted distances before plan 008, at azimuths 0, 1, 2.5 and -2.
    const before: Record<string, number[]> = {
      '1280x800': [20.9872, 22.9006, 24.3783, 17.9245],
      '1920x1080': [20.2669, 22.1174, 23.5465, 17.305],
      '2560x1080': [20.2669, 22.1174, 23.5465, 17.305],
    };
    for (const [key, ds] of Object.entries(before)) {
      const [w, h] = key.split('x').map(Number) as [number, number];
      [0, 1, 2.5, -2].forEach((az, i) => {
        const pose = overviewPose(az, overviewFov(w / h), w, h);
        expect(pose.fov).toBe(50);
        expect(pose.lift).toBe(0);
        expect(pose.dir.y).toBe(OVERVIEW_DIR.y);
        expect(pose.distance).toBeCloseTo(ds[i]!, 3);
      });
    }
  });

  it('blends portrait and landscape between aspect 0.8 and 1.0 without a jump', () => {
    const h = 800;
    let prev: ReturnType<typeof overviewPose> | null = null;
    for (let a = 0.76; a <= 1.04; a += 0.004) {
      const w = a * h;
      const pose = overviewPose(0, overviewFov(a), w, h);
      if (prev) {
        expect(Math.abs(pose.distance - prev.distance)).toBeLessThan(0.6);
        expect(Math.abs(pose.lift - prev.lift)).toBeLessThan(0.01);
        expect(Math.abs(pose.fov - prev.fov)).toBeLessThan(0.5);
        expect(Math.abs(pose.dir.y - prev.dir.y)).toBeLessThan(0.2);
      }
      prev = pose;
    }
    expect(overviewFov(0.8)).toBe(overviewFov(0.5));
    expect(overviewFov(1)).toBe(50);
    expect(overviewPose(0, overviewFov(1), 800, 800).lift).toBe(0);
    expect(overviewPose(0, overviewFov(0.8), 640, 800).lift).toBeGreaterThan(0);
  });
});
