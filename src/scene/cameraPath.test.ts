import { describe, expect, it } from 'vitest';
import {
  nearestAzimuth,
  outwardAzimuth,
  overviewDirAt,
  overviewDistanceAt,
  overviewDistanceMax,
  overviewPose,
  polarPose,
  wrapAngle,
} from './cameraPath';
import { overviewFov, project } from './framing';
import { OVERVIEW_DIR, OVERVIEW_MARGIN, OVERVIEW_POINTS, OVERVIEW_TARGET } from './layout';

const deg = (d: number) => (d * Math.PI) / 180;

describe('wrapAngle', () => {
  it('keeps small angles', () => {
    expect(wrapAngle(deg(30))).toBeCloseTo(deg(30));
    expect(wrapAngle(deg(-30))).toBeCloseTo(deg(-30));
  });
  it('wraps past a half turn the short way', () => {
    expect(wrapAngle(deg(358))).toBeCloseTo(deg(-2));
    expect(wrapAngle(deg(-358))).toBeCloseTo(deg(2));
    expect(wrapAngle(deg(720 + 10))).toBeCloseTo(deg(10));
  });
  it('maps the half-turn boundary to +PI, never -PI', () => {
    expect(wrapAngle(Math.PI)).toBeCloseTo(Math.PI);
    expect(wrapAngle(-Math.PI)).toBeCloseTo(Math.PI);
  });
});

describe('nearestAzimuth', () => {
  it('turns 2 degrees from 179 to -179', () => {
    const r = nearestAzimuth(deg(179), deg(-179));
    expect(r).toBeCloseTo(deg(181));
    expect(Math.abs(r - deg(179))).toBeCloseTo(deg(2));
  });
  it('turns 2 degrees the other way too', () => {
    expect(Math.abs(nearestAzimuth(deg(-179), deg(179)) - deg(-179))).toBeCloseTo(deg(2));
  });
  it('never turns more than half a circle, including the 0 to PI boundary', () => {
    for (const cur of [0, 1, -3, 7, -9.5, 20]) {
      for (const pref of [0, Math.PI, -Math.PI, 2, -2.5]) {
        const r = nearestAzimuth(cur, pref);
        expect(Math.abs(r - cur)).toBeLessThanOrEqual(Math.PI + 1e-9);
        expect(Math.cos(r)).toBeCloseTo(Math.cos(pref));
        expect(Math.sin(r)).toBeCloseTo(Math.sin(pref));
      }
    }
  });
  it('stays put when already facing the preferred way', () => {
    expect(nearestAzimuth(deg(400), deg(40))).toBeCloseTo(deg(400));
  });
  it('follows an unbounded current angle', () => {
    expect(nearestAzimuth(deg(700), deg(-10))).toBeCloseTo(deg(710));
  });
});

describe('outwardAzimuth', () => {
  it('points along the outward offset', () => {
    expect(outwardAzimuth(0, 5, 1)).toBeCloseTo(0);
    expect(outwardAzimuth(5, 0, 1)).toBeCloseTo(Math.PI / 2);
    expect(outwardAzimuth(0, -5, 1)).toBeCloseTo(Math.PI);
  });
  it('uses the fallback at the centre', () => {
    expect(outwardAzimuth(0, 0, 1.25)).toBe(1.25);
  });
});

describe('polarPose', () => {
  it('derives polar angle and distance', () => {
    const p = polarPose(3, 4);
    expect(p.distance).toBeCloseTo(5);
    expect(p.polar).toBeCloseTo(Math.atan2(3, 4));
  });
});

describe('overview return poses', () => {
  const sizes: [number, number][] = [
    [390, 844],
    [1280, 800],
  ];
  it('fits every overview point on screen from any azimuth', () => {
    for (const [w, h] of sizes) {
      const fov = overviewFov(w / h);
      for (let i = 0; i < 16; i++) {
        const az = (i / 16) * Math.PI * 2 - Math.PI;
        const d = overviewDistanceAt(az, fov, w, h);
        const pose = overviewPose(az, fov, w, h);
        expect(pose.distance).toBe(d);
        const spec = {
          target: OVERVIEW_TARGET,
          dir: pose.dir,
          fovDeg: fov,
          width: w,
          height: h,
          margin: OVERVIEW_MARGIN,
          lift: pose.lift,
        };
        for (const p of OVERVIEW_POINTS) {
          const n = project(spec, d, p);
          const x = ((n.x + 1) / 2) * w;
          const y = ((1 - n.y) / 2) * h;
          expect(x).toBeGreaterThanOrEqual(OVERVIEW_MARGIN.side - 0.5);
          expect(x).toBeLessThanOrEqual(w - OVERVIEW_MARGIN.side + 0.5);
          expect(y).toBeGreaterThanOrEqual(OVERVIEW_MARGIN.top - 0.5);
          expect(y).toBeLessThanOrEqual(h - OVERVIEW_MARGIN.bottom + 0.5);
        }
        // The max samples 24 azimuths; between samples the fit can be a hair farther (the zoom limit
        // adds 25% on top, `maxCameraDistance`).
        expect(d).toBeLessThanOrEqual(overviewDistanceMax(fov, w, h) * 1.01);
      }
    }
  });
  it('keeps the original direction at azimuth 0', () => {
    const d = overviewDirAt(0);
    expect(d.x).toBeCloseTo(0);
    expect(d.z).toBeCloseTo(OVERVIEW_DIR.z);
    expect(d.y).toBe(OVERVIEW_DIR.y);
  });
});
