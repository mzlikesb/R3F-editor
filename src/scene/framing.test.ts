import { describe, expect, it } from 'vitest';
import { fitDistance, overviewFov, project, type FrameSpec } from './framing';
import { OVERVIEW_DIR, OVERVIEW_POINTS, OVERVIEW_TARGET } from './layout';

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
